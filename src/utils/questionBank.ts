import { openDatabase } from './database';
import { notifyGitHubSyncDataChanged } from './githubSync';
import type { UserQuestionState } from '../api/types';
import { directorySignature, mergeDirectory, parseDirectoryJson } from './categoryJson';

export interface BankCategory {
  id: number;
  parentId: number | null;
  name: string;
  sortOrder: number;
  questionIds: number[];
}
export interface BankQuestion {
  id: number;
  contentMarkdown: string;
  answerMarkdown: string | null;
  explanationMarkdown: string;
  sourceText: string;
  primaryCategoryId: number | null;
  categoryIds: number[];
}
interface Chunk { file: string; count: number; bytes: number; sha256: string }
export interface Manifest {
  schemaVersion: number;
  questionBank: { id: string; subjectCode: string; name: string; rootCategoryIds: number[] };
  stats: { categoryCount: number; questionCount: number };
  chunks: { categories: Chunk[]; questions: Chunk[] };
}
export interface LocalBank {
  displayName?: string;
  manifest: Manifest;
  categories: BankCategory[];
  questions: BankQuestion[];
  sourceUrl: string;
  syncTime: number;
}

export type BankImportConflictStrategy = 'overwrite' | 'create';

export class BankAlreadyExistsError extends Error {
  readonly bankId: string;

  constructor(bankId: string) {
    super('当前导入的题库已经存在');
    this.name = 'BankAlreadyExistsError';
    this.bankId = bankId;
  }
}

// Published snapshots are replaced after successful writes, never mutated in place.
let bankSnapshot: Promise<LocalBank | null> | undefined;
const bankChanges = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('daguan-bank-changes');
if (bankChanges) bankChanges.onmessage = () => { bankSnapshot = undefined; };

export function readBank(): Promise<LocalBank | null> {
  if (!bankSnapshot) {
    const pending = loadBankSnapshot();
    bankSnapshot = pending;
    void pending.catch(() => {
      if (bankSnapshot === pending) bankSnapshot = undefined;
    });
  }
  return bankSnapshot;
}
async function loadBankSnapshot(): Promise<LocalBank | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['bank', 'settings']);
    const request = tx.objectStore('settings').get('currentBank');
    request.onsuccess = () => {
      if (!request.result?.bankId) { resolve(null); return; }
      const bank = tx.objectStore('bank').get(request.result.bankId);
      bank.onsuccess = () => resolve(bank.result ?? null);
      bank.onerror = () => reject(bank.error);
    };
    request.onerror = () => reject(request.error);
  });
}
async function saveBank(bank: LocalBank) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['bank', 'bankCatalog', 'settings'], 'readwrite');
    const id = bank.manifest.questionBank.id;
    tx.objectStore('bank').put(bank, id);
    tx.objectStore('bankCatalog').put({ id, name: bank.displayName || bank.manifest.questionBank.name,
      questionCount: bank.questions.length, syncTime: bank.syncTime, sourceUrl: bank.sourceUrl }, id);
    tx.objectStore('settings').put({ version: 1, bankId: id }, 'currentBank');
    tx.oncomplete = () => {
      bankSnapshot = Promise.resolve(bank);
      bankChanges?.postMessage('synced');
      resolve();
    };
    tx.onabort = () => reject(tx.error ?? new Error('题库保存失败'));
    tx.onerror = () => reject(tx.error);
  });
}
export async function createLocalBank(input: string): Promise<LocalBank> {
  const name = input.trim();
  if (!name) throw new Error('请输入题库名称');
  const id = String(Date.now());
  const bank: LocalBank = {
    displayName: name,
    manifest: {
      schemaVersion: 1,
      questionBank: { id, subjectCode: id, name, rootCategoryIds: [1] },
      stats: { categoryCount: 1, questionCount: 0 },
      chunks: { categories: [], questions: [] },
    },
    categories: [{ id: 1, parentId: null, name: '默认章节', sortOrder: 1, questionIds: [] }],
    questions: [],
    sourceUrl: '',
    syncTime: Date.now(),
  };
  await saveBank(bank);
  return bank;
}

async function updateLocalBank(bankId: string, update: (bank: LocalBank) => LocalBank): Promise<LocalBank> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['bank', 'bankCatalog', 'settings'], 'readwrite');
    const store = tx.objectStore('bank');
    let updatedBank: LocalBank;
    let failure: Error | undefined;
    const current = tx.objectStore('settings').get('currentBank');
    current.onsuccess = () => {
      if (current.result?.bankId !== bankId) {
        failure = new Error('当前题库已切换，请重新选择章节');
        tx.abort();
        return;
      }
      const request = store.get(bankId);
      request.onsuccess = () => {
        const savedBank = request.result as LocalBank | undefined;
        try {
          if (!savedBank) throw new Error('题库不存在，请重新加载');
          updatedBank = update(savedBank);
          store.put(updatedBank, bankId);
          tx.objectStore('bankCatalog').put({
            id: bankId, name: updatedBank.displayName || updatedBank.manifest.questionBank.name,
            questionCount: updatedBank.questions.length, syncTime: updatedBank.syncTime,
            sourceUrl: updatedBank.sourceUrl,
          }, bankId);
        } catch (cause) {
          failure = cause instanceof Error ? cause : new Error('题库保存失败');
          tx.abort();
        }
      };
    };
    tx.oncomplete = () => {
      bankSnapshot = undefined;
      bankChanges?.postMessage('bank-updated');
      resolve(updatedBank);
    };
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('题库保存失败'));
    tx.onerror = () => reject(tx.error ?? new Error('题库保存失败'));
  });
}

export async function renameBankCategory(bankId: string, categoryId: number, input: string): Promise<LocalBank> {
  const name = input.trim();
  if (!name) throw new Error('请输入章节名称');
  return updateLocalBank(bankId, bank => {
    if (!bank.categories.some(category => category.id === categoryId)) {
      throw new Error('章节不存在，请重新加载题库');
    }
    return {
      ...bank,
      categories: bank.categories.map(category =>
        category.id === categoryId ? { ...category, name } : category),
    };
  });
}

export async function importBankDirectory(bankId: string, input: string, expectedSignature: string) {
  const nodes = parseDirectoryJson(input);
  return updateLocalBank(bankId, bank => {
    if (directorySignature(bank) !== expectedSignature) {
      throw new Error('目录已发生变化，请重新打开对话框并预览后确认');
    }
    return mergeDirectory(bank, nodes).bank;
  });
}

export async function createBankCategory(bankId: string, parentId: number | null, input: string) {
  const name = input.trim();
  if (!name) throw new Error('请输入章节名称');
  let categoryId = 0;
  const bank = await updateLocalBank(bankId, bank => {
    if (parentId !== null && !bank.categories.some(category => category.id === parentId)) {
      throw new Error('父章节不存在，请重新加载题库');
    }
    categoryId = bank.categories.reduce((max, category) => Math.max(max, category.id), 0) + 1;
    const sortOrder = bank.categories.reduce((max, category) =>
      category.parentId === parentId ? Math.max(max, category.sortOrder) : max, 0) + 1;
    if (!Number.isSafeInteger(categoryId)) throw new Error('无法分配章节 ID');
    const categories = [...bank.categories, { id: categoryId, parentId, name, sortOrder, questionIds: [] }];
    return {
      ...bank,
      categories,
      manifest: {
        ...bank.manifest,
        questionBank: {
          ...bank.manifest.questionBank,
          rootCategoryIds: parentId === null
            ? [...bank.manifest.questionBank.rootCategoryIds, categoryId]
            : bank.manifest.questionBank.rootCategoryIds,
        },
        stats: { ...bank.manifest.stats, categoryCount: categories.length },
      },
    };
  });
  return { bank, categoryId };
}

export async function deleteBankCategory(bankId: string, categoryId: number): Promise<LocalBank> {
  return updateLocalBank(bankId, bank => {
    if (!bank.categories.some(category => category.id === categoryId)) {
      throw new Error('章节不存在，请重新加载题库');
    }
    const children = new Map<number, number[]>();
    for (const category of bank.categories) {
      if (category.parentId === null) continue;
      const siblings = children.get(category.parentId) ?? [];
      siblings.push(category.id);
      children.set(category.parentId, siblings);
    }
    const removedIds = new Set<number>();
    const pending = [categoryId];
    while (pending.length) {
      const id = pending.pop()!;
      if (removedIds.has(id)) continue;
      removedIds.add(id);
      pending.push(...(children.get(id) ?? []));
    }
    const removedQuestionIds = new Set<number>();
    for (const category of bank.categories) {
      if (removedIds.has(category.id)) {
        category.questionIds.forEach(id => removedQuestionIds.add(id));
      }
    }
    for (const question of bank.questions) {
      if (question.categoryIds.some(id => removedIds.has(id)) ||
          (question.primaryCategoryId !== null && removedIds.has(question.primaryCategoryId))) {
        removedQuestionIds.add(question.id);
      }
    }
    const categories = bank.categories
      .filter(category => !removedIds.has(category.id))
      .map(category => ({
        ...category,
        questionIds: category.questionIds.filter(id => !removedQuestionIds.has(id)),
      }));
    const questions = bank.questions.filter(question => !removedQuestionIds.has(question.id));
    return {
      ...bank,
      categories,
      questions,
      manifest: {
        ...bank.manifest,
        questionBank: {
          ...bank.manifest.questionBank,
          rootCategoryIds: bank.manifest.questionBank.rootCategoryIds.filter(id => !removedIds.has(id)),
        },
        stats: { ...bank.manifest.stats, categoryCount: categories.length, questionCount: questions.length },
      },
    };
  });
}

export type QuestionEdit = Pick<BankQuestion, 'contentMarkdown' | 'answerMarkdown' | 'explanationMarkdown'>;
export type QuestionBatchAction = 'delete' | 'move' | 'copy';
export interface QuestionBatchRequest {
  bankId: string;
  action: QuestionBatchAction;
  sourceCategoryId: number;
  questionIds: number[];
}

export async function createBankQuestion(bankId: string, categoryId: number, input: QuestionEdit & { sourceText: string }) {
  if (!input.contentMarkdown.trim()) throw new Error('题目内容不能为空');
  return updateLocalBank(bankId, bank => {
    if (!bank.categories.some(category => category.id === categoryId)) throw new Error('请选择有效章节');
    const id = bank.questions.reduce((max, question) => Math.max(max, question.id), 0) + 1;
    if (!Number.isSafeInteger(id)) throw new Error('无法分配题目 ID');
    const question: BankQuestion = {
      id, contentMarkdown: input.contentMarkdown, answerMarkdown: input.answerMarkdown,
      explanationMarkdown: input.explanationMarkdown, sourceText: input.sourceText,
      categoryIds: [categoryId], primaryCategoryId: categoryId,
    };
    const questions = [...bank.questions, question];
    return {
      ...bank, questions,
      categories: bank.categories.map(category => category.id === categoryId
        ? { ...category, questionIds: [...category.questionIds, id] } : category),
      manifest: { ...bank.manifest, stats: { ...bank.manifest.stats, questionCount: questions.length } },
    };
  });
}

export async function editBankQuestion(bankId: string, questionId: number, edit: QuestionEdit) {
  if (!edit.contentMarkdown.trim()) throw new Error('题目内容不能为空');
  return updateLocalBank(bankId, bank => {
    if (!bank.questions.some(question => question.id === questionId)) throw new Error('题目不存在，请重新加载');
    return {
      ...bank,
      questions: bank.questions.map(question => question.id === questionId ? {
        ...question,
        contentMarkdown: edit.contentMarkdown,
        answerMarkdown: edit.answerMarkdown,
        explanationMarkdown: edit.explanationMarkdown,
      } : question),
    };
  });
}

export async function batchBankQuestions(request: QuestionBatchRequest, targetCategoryId?: number) {
  return updateLocalBank(request.bankId, bank => {
    const { action, sourceCategoryId } = request;
    const selectedIds = new Set(request.questionIds);
    if (!selectedIds.size) throw new Error('请先选择题目');
    const source = bank.categories.find(category => category.id === sourceCategoryId);
    const sourceIds = new Set(source?.questionIds ?? []);
    const selected = bank.questions.filter(question => selectedIds.has(question.id));
    if (!source || selected.length !== selectedIds.size || selected.some(question => !sourceIds.has(question.id))) {
      throw new Error('所选题目或章节已变更，请重新选择');
    }
    if (action !== 'delete' && (targetCategoryId === sourceCategoryId ||
        !bank.categories.some(category => category.id === targetCategoryId))) {
      throw new Error('请选择其他目标章节');
    }

    let categories = bank.categories;
    let questions = bank.questions;
    if (action === 'delete') {
      questions = questions.filter(question => !selectedIds.has(question.id));
      categories = categories.map(category => ({
        ...category, questionIds: category.questionIds.filter(id => !selectedIds.has(id)),
      }));
    } else if (action === 'move') {
      categories = categories.map(category => {
        if (category.id === sourceCategoryId) return {
          ...category, questionIds: category.questionIds.filter(id => !selectedIds.has(id)),
        };
        if (category.id === targetCategoryId) return {
          ...category, questionIds: [...new Set([...category.questionIds, ...selectedIds])],
        };
        return category;
      });
      const memberships = new Map<number, number[]>();
      for (const category of categories) {
        for (const id of category.questionIds) {
          if (!selectedIds.has(id)) continue;
          const ids = memberships.get(id) ?? [];
          ids.push(category.id);
          memberships.set(id, ids);
        }
      }
      questions = questions.map(question => {
        if (!selectedIds.has(question.id)) return question;
        const categoryIds = memberships.get(question.id) ?? [];
        return { ...question, categoryIds,
          primaryCategoryId: question.primaryCategoryId !== null && categoryIds.includes(question.primaryCategoryId)
            ? question.primaryCategoryId : targetCategoryId!,
        };
      });
    } else if (action === 'copy') {
      let nextId = questions.reduce((max, question) => Math.max(max, question.id), 0);
      if (!Number.isSafeInteger(nextId + selected.length)) {
        throw new Error('题目 ID 已超出安全整数范围，无法复制');
      }
      const copies = selected.map(question => {
        const id = ++nextId;
        return { ...question, id, categoryIds: [targetCategoryId!], primaryCategoryId: targetCategoryId! };
      });
      questions = [...questions, ...copies];
      categories = categories.map(category => category.id === targetCategoryId ? {
        ...category, questionIds: [...category.questionIds, ...copies.map(question => question.id)],
      } : category);
    } else {
      throw new Error('不支持的批量操作');
    }
    return { ...bank, categories, questions,
      manifest: { ...bank.manifest, stats: { ...bank.manifest.stats, questionCount: questions.length } },
    };
  });
}

export interface SavedBank {
  id: string;
  name: string;
  questionCount: number;
  syncTime: number;
  sourceUrl: string;
}

export async function listBanks(): Promise<{ banks: SavedBank[]; currentId: string | null }> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['bankCatalog', 'settings']);
    const banks = tx.objectStore('bankCatalog').getAll();
    const current = tx.objectStore('settings').get('currentBank');
    tx.oncomplete = () => resolve({ banks: banks.result, currentId: current.result?.bankId ?? null });
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function selectBank(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['bankCatalog', 'settings'], 'readwrite');
    const request = tx.objectStore('bankCatalog').get(id);
    request.onsuccess = () => {
      if (!request.result) { tx.abort(); return; }
      tx.objectStore('settings').put({ version: 1, bankId: id }, 'currentBank');
    };
    tx.oncomplete = () => {
      bankSnapshot = undefined;
      bankChanges?.postMessage('selected');
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('所选题库不存在，请重新选择'));
  });
}

export async function deleteBank(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['bank', 'bankCatalog', 'states', 'settings'], 'readwrite');
    const current = tx.objectStore('settings').get('currentBank');
    current.onsuccess = () => {
      if (current.result?.bankId === id) { tx.abort(); return; }
      tx.objectStore('bank').delete(id);
      tx.objectStore('bankCatalog').delete(id);
      tx.objectStore('states').delete(`bank:${id}`);
      tx.objectStore('settings').delete(`lastPractice:${id}`);
    };
    tx.oncomplete = () => {
      notifyGitHubSyncDataChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('当前题库不能删除'));
  });
}
export const emptyState = (): UserQuestionState => ({
  is_favorite: false, is_wrong_book: false, is_mastered: false, mastered_at: null, note: '',
});
export async function readStates(bankId: string): Promise<Record<number, UserQuestionState>> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('states').objectStore('states').get(`bank:${bankId}`);
    request.onsuccess = () => resolve(request.result ?? {});
    request.onerror = () => reject(request.error);
  });
}
export async function updateState(id: number, change: (state: UserQuestionState) => void) {
  const bank = await readBank();
  if (!bank) throw new Error('请先导入在线题库');
  const db = await openDatabase();
  return new Promise<UserQuestionState>((resolve, reject) => {
    const tx = db.transaction('states', 'readwrite');
    const store = tx.objectStore('states');
    const key = `bank:${bank.manifest.questionBank.id}`;
    const request = store.get(key);
    let state: UserQuestionState;
    request.onsuccess = () => {
      const states = request.result ?? {};
      state = states[id] ?? emptyState();
      const wasMastered = state.is_mastered;
      change(state);
      if (!state.is_mastered) state.mastered_at = null;
      else if (!wasMastered) state.mastered_at = new Date().toISOString();
      states[id] = state;
      store.put(states, key);
    };
    tx.oncomplete = () => {
      notifyGitHubSyncDataChanged();
      resolve(state);
    };
    tx.onabort = () => reject(tx.error ?? new Error('本地记录保存失败'));
    tx.onerror = () => reject(tx.error);
  });
}

export async function downloadBank(
  input: string,
  progress: (percent: number, status: string) => void,
  name: string,
  conflictStrategy?: BankImportConflictStrategy,
) {
  if (!name.trim()) throw new Error('请输入题库名称');
  const base = new URL(input.trim());
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
    throw new Error('请输入 HTTP 或 HTTPS 服务器 URL');
  }
  base.search = '';
  base.hash = '';
  base.pathname = base.pathname.replace(/\/+$/, '') + '/';
  async function fetchFile(url: URL) {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`下载失败：${url.pathname} (${response.status})`);
    return response;
  }
  progress(0, '正在获取 manifest.json...');
  const manifest: Manifest = await (await fetchFile(new URL('manifest.json', base))).json();
  if (manifest.schemaVersion !== 1 || !manifest.questionBank?.subjectCode ||
      typeof manifest.questionBank.id !== 'string' || !manifest.questionBank.id.trim() ||
      !Array.isArray(manifest.questionBank.rootCategoryIds) || !manifest.stats ||
      !Array.isArray(manifest.chunks?.categories) || !Array.isArray(manifest.chunks?.questions)) {
    throw new Error('不支持的题库清单格式');
  }
  const manifestId = manifest.questionBank.id;
  const { banks } = await listBanks();
  if (banks.some(bank => bank.id === manifestId)) {
    if (!conflictStrategy) throw new BankAlreadyExistsError(manifestId);
    if (conflictStrategy === 'create') manifest.questionBank.id = String(Date.now());
  }
  const total = manifest.chunks.categories.length + manifest.chunks.questions.length;
  let completed = 0;
  async function readChunks<T>(chunks: Chunk[]): Promise<T[]> {
    const rows: T[] = [];
    for (const chunk of chunks) {
      const url = new URL(chunk.file, base);
      if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
        throw new Error('题库分片路径超出服务器目录');
      }
      progress(Math.round(completed / total * 90), `正在下载 ${chunk.file}...`);
      const bytes = await (await fetchFile(url)).arrayBuffer();
      if (bytes.byteLength !== chunk.bytes) throw new Error(`分片大小不符：${chunk.file}`);
      if (globalThis.crypto?.subtle && chunk.sha256) {
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
        if (hash !== chunk.sha256) throw new Error(`分片校验失败：${chunk.file}`);
      }
      const data = JSON.parse(new TextDecoder().decode(bytes));
      if (!Array.isArray(data) || data.length !== chunk.count) throw new Error(`分片数量不符：${chunk.file}`);
      rows.push(...data);
      completed++;
    }
    return rows;
  }
  const categories = await readChunks<BankCategory>(manifest.chunks.categories);
  const questions = await readChunks<BankQuestion>(manifest.chunks.questions);
  if (categories.length !== manifest.stats.categoryCount || questions.length !== manifest.stats.questionCount ||
      new Set(categories.map(c => c.id)).size !== categories.length ||
      new Set(questions.map(q => q.id)).size !== questions.length) throw new Error('题库总数不符或存在重复 ID');
  const categoryIds = new Set(categories.map(c => c.id));
  const questionIds = new Set(questions.map(q => q.id));
  const parents = new Map(categories.map(c => [c.id, c.parentId]));
  for (const category of categories) {
    const seen = new Set<number>();
    let id: number | null = category.id;
    while (id !== null) {
      if (seen.has(id) || !categoryIds.has(id)) throw new Error('题库目录存在循环或缺失父目录');
      seen.add(id);
      id = parents.get(id) ?? null;
    }
    if (!Array.isArray(category.questionIds) || category.questionIds.some(id => !questionIds.has(id))) {
      throw new Error('目录引用了不存在的题目');
    }
  }
  if (manifest.questionBank.rootCategoryIds.some(id => !categoryIds.has(id) || parents.get(id) !== null)) {
    throw new Error('题库根目录无效');
  }
  const bank: LocalBank = { manifest, categories, questions, sourceUrl: base.href, syncTime: Date.now(), displayName: name.trim() };
  progress(95, '正在写入 IndexedDB...');
  await saveBank(bank);
  progress(100, '导入完成');
  return bank;
}
