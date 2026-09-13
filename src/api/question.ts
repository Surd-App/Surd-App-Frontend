import type { Question, QuestionListResponse } from './types';
import { emptyState, readBank, readStates, updateState } from '../utils/questionBank';

async function localQuestions(categoryId?: number): Promise<Question[]> {
  const bank = await readBank();
  if (!bank) return [];
  const states = await readStates(bank.manifest.questionBank.subjectCode);
  let selected: Set<number> | undefined;
  if (categoryId !== undefined) {
    selected = new Set<number>();
    const visit = (id: number) => {
      const category = bank.categories.find(c => c.id === id);
      category?.questionIds.forEach(questionId => selected!.add(questionId));
      bank.categories.filter(c => c.parentId === id).forEach(c => visit(c.id));
    };
    visit(categoryId);
  }
  const questionsById = new Map(bank.questions.map(question => [question.id, question]));
  const rows = selected ? [...selected].map(id => questionsById.get(id)!).filter(Boolean) : bank.questions;
  return rows.map((question, index) => ({
    id: question.id, category_id: question.primaryCategoryId ?? categoryId ?? 0,
    serial_number: index + 1, 题号: index + 1,
    题目内容: question.contentMarkdown, 选项A: '', 选项B: '', 选项C: '', 选项D: '',
    答案: question.answerMarkdown ?? '', 解析: question.explanationMarkdown ?? '',
    题源: question.sourceText ?? '', 是否选做: '', 时间戳: null, video_url: null,
    user_state: states[question.id] ?? emptyState(),
  }));
}
function paginate(items: Question[], page: number, perPage: number): QuestionListResponse {
  return { items: items.slice((page - 1) * perPage, page * perPage), total: items.length,
    pages: Math.ceil(items.length / perPage), current_page: page };
}
export async function getQuestions(categoryId: number, page = 1, perPage = 10000) {
  return paginate(await localQuestions(categoryId), page, perPage);
}
export const toggleFavorite = (id: number) => updateState(id, state => { state.is_favorite = !state.is_favorite; });
export const toggleWrongBook = (id: number) => updateState(id, state => { state.is_wrong_book = !state.is_wrong_book; });
export const toggleMastered = (id: number) => updateState(id, state => { state.is_mastered = !state.is_mastered; });
export async function saveQuestionNote(id: number, note: string) {
  await updateState(id, state => { state.note = note; });
  return { message: '笔记已保存到本地' };
}
export async function submitQuestionFeedback(_id: number, _type: string, _content: string): Promise<void> {
  throw new Error('静态题库暂不支持提交纠错');
}
export async function getWrongQuestions(perPage = 10000) {
  return paginate((await localQuestions()).filter(q => q.user_state.is_wrong_book), 1, perPage);
}
export async function getFavoriteQuestions(perPage = 10000) {
  return paginate((await localQuestions()).filter(q => q.user_state.is_favorite), 1, perPage);
}
