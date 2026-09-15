import { openDatabase } from './database';

const stores = ['states', 'settings'] as const;
const excludedSettingKeys = new Set(['githubSync', 'githubSyncKey', 'githubSyncMeta']);
type StoreName = typeof stores[number];
type Entry = { key: string; value: any };
export interface LocalBackup {
  format: 'daguan-local-backup';
  version: 1;
  exportedAt: string;
  theme: 'light' | 'dark' | null;
  stores: Record<StoreName, Entry[]>;
}

async function encodeImage(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { type: blob.type, base64: btoa(binary) };
}

export async function exportBackup(): Promise<LocalBackup> {
  const db = await openDatabase();
  const snapshot = await new Promise<Record<StoreName, Entry[]>>((resolve, reject) => {
    const tx = db.transaction([...stores]);
    const result = { states: [], settings: [] } as Record<StoreName, Entry[]>;
    for (const name of stores) {
      const request = tx.objectStore(name).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const key = String(cursor.key);
        if (name !== 'settings' || !excludedSettingKeys.has(key)) {
          result[name].push({ key, value: cursor.value });
        }
        cursor.continue();
      };
    }
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error ?? new Error('备份读取失败'));
    tx.onerror = () => reject(tx.error);
  });
  for (const entry of snapshot.settings) {
    const background = entry.value?.background;
    if (background?.image instanceof Blob) background.image = await encodeImage(background.image);
  }
  const theme = localStorage.getItem('theme');
  return {
    format: 'daguan-local-backup', version: 1, exportedAt: new Date().toISOString(),
    theme: theme === 'dark' || theme === 'light' ? theme : null, stores: snapshot,
  };
}

function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new Error('备份格式或数据无效，请选择本应用导出的完整备份');
}

export function parseBackup(text: string): LocalBackup {
  const backup = JSON.parse(text) as LocalBackup;
  requireValid(backup?.format === 'daguan-local-backup' && backup.version === 1 && backup.stores);
  requireValid(Number.isFinite(Date.parse(backup.exportedAt)));
  requireValid([null, 'light', 'dark'].includes(backup.theme));
  for (const name of stores) {
    requireValid(Array.isArray(backup.stores[name]));
    const keys = new Set<string>();
    for (const entry of backup.stores[name]) {
      requireValid(entry && typeof entry.key === 'string' && entry.key.length && !keys.has(entry.key));
      requireValid(entry.value && typeof entry.value === 'object' && !Array.isArray(entry.value));
      keys.add(entry.key);
    }
  }
  for (const entry of backup.stores.states) {
    for (const [id, state] of Object.entries(entry.value) as [string, any][]) {
      requireValid(/^\d+$/.test(id) && state && typeof state.note === 'string');
      requireValid(['is_mastered', 'is_favorite', 'is_wrong_book'].every(key => typeof state[key] === 'boolean'));
      requireValid(state.mastered_at == null || (typeof state.mastered_at === 'string' && Number.isFinite(Date.parse(state.mastered_at))));
    }
  }
  for (const { key, value } of backup.stores.settings) {
    if (key === 'currentBank') {
      requireValid(value.version === 1 && typeof value.bankId === 'string' && value.bankId.trim().length > 0);
      continue;
    }
    if (key.startsWith('lastPractice:')) {
      requireValid(value.version === 1 && typeof value.bankId === 'string' && key === `lastPractice:${value.bankId}`);
      requireValid([value.categoryId, value.questionId, value.questionNumber, value.updatedAt]
        .every(item => Number.isInteger(item) && item > 0));
      continue;
    }
    requireValid(key === 'personalization' && value.version === 1);
    const bg = value.background;
    requireValid(bg && ['solid', 'image', 'bing'].includes(bg.type) && typeof bg.imageName === 'string');
    if (bg.image !== null) {
      requireValid(bg.image && typeof bg.image.type === 'string' && bg.image.type.startsWith('image/') && typeof bg.image.base64 === 'string');
      const bytes = Uint8Array.from(atob(bg.image.base64), character => character.charCodeAt(0));
      requireValid(bytes.length > 0);
      bg.image = new Blob([bytes], { type: bg.image.type });
    }
  }
  // Older backups may contain a bank snapshot; deliberately discard it.
  return {
    format: backup.format, version: backup.version, exportedAt: backup.exportedAt,
    theme: backup.theme,
    stores: { states: backup.stores.states, settings: backup.stores.settings },
  };
}

export async function restoreBackup(backup: LocalBackup) {
  const db = await openDatabase();
  const protectedSettings = await new Promise<Entry[]>((resolve, reject) => {
    const tx = db.transaction('settings');
    const store = tx.objectStore('settings');
    const entries: Entry[] = [];
    for (const key of excludedSettingKeys) {
      const request = store.get(key);
      request.onsuccess = () => {
        if (request.result !== undefined) entries.push({ key, value: request.result });
      };
    }
    tx.oncomplete = () => resolve(entries);
    tx.onabort = () => reject(tx.error ?? new Error('云同步设置读取失败'));
    tx.onerror = () => reject(tx.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([...stores], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('导入失败，原有数据已保留'));
    tx.onerror = () => reject(tx.error);
    try {
      for (const name of stores) {
        const store = tx.objectStore(name);
        store.clear();
        for (const entry of backup.stores[name]) store.put(entry.value, entry.key);
        if (name === 'settings') {
          for (const entry of protectedSettings) store.put(entry.value, entry.key);
        }
      }
    } catch (error) { tx.abort(); reject(error); }
  });
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('daguan-bank-changes');
  channel?.postMessage('restored');
  channel?.close();
  if (backup.theme === null) localStorage.removeItem('theme');
  else localStorage.setItem('theme', backup.theme);
}
