import type { Question } from '../api/types'
import { readBank, readStates, emptyState } from '../utils/questionBank'
export interface QuestionGroup { id: string; title: string; questionIds: string[]; collapsed: boolean; order: number; parentId: string | null; depth: number; totalQuestions: number }
export interface CanvasData { title: string; groups: QuestionGroup[]; questions: Map<string, Question>; labels: Map<string, string> }
export async function loadCanvasData(categoryId: number): Promise<CanvasData> {
  const bank = await readBank()
  if (!bank) throw new Error('请先导入在线题库')
  const byId = new Map(bank.categories.map(c => [c.id, c]))
  const root = byId.get(categoryId)
  if (!root) throw new Error('该章节不存在，请返回卡片地图重新选择')
  const states = await readStates(bank.manifest.questionBank.subjectCode)
  const children = new Map<number, typeof bank.categories>()
  for (const category of bank.categories) {
    if (category.parentId === null) continue
    const list = children.get(category.parentId) ?? []
    list.push(category); children.set(category.parentId, list)
  }
  for (const list of children.values()) list.sort((a,b) => a.sortOrder-b.sortOrder || a.id-b.id)
  const groups: QuestionGroup[] = []
  const selected = new Set<number>()
  const labels = new Map<string, string>()
  function visit(id: number, path: string, parentId: string | null = null, depth = 0): number {
    const category = byId.get(id)!
    const title = path ? `${path} / ${category.name}` : category.name
    const ids = category.questionIds.filter(id => !selected.has(id))
    ids.forEach(id => { selected.add(id); labels.set(String(id), title) })
    const group: QuestionGroup = { id: String(id), title: category.name, questionIds: ids.map(String), collapsed: false,
      order: groups.length, parentId, depth, totalQuestions: ids.length }
    groups.push(group)
    for (const child of children.get(id) ?? []) group.totalQuestions += visit(child.id, title, group.id, depth + 1)
    return group.totalQuestions
  }
  visit(categoryId, '')
  const questions = new Map<string, Question>()
  for (const q of bank.questions) {
    if (!selected.has(q.id)) continue
    questions.set(String(q.id), { id: q.id, category_id: q.primaryCategoryId ?? categoryId,
      serial_number: q.id, 题号: q.id, 题目内容: q.contentMarkdown,
      选项A: '', 选项B: '', 选项C: '', 选项D: '', 答案: q.answerMarkdown ?? '',
      解析: q.explanationMarkdown ?? '', 题源: q.sourceText ?? '', 是否选做: '',
      时间戳: null, video_url: null, user_state: states[q.id] ?? emptyState() })
  }
  return { title: root.name, groups, questions, labels }
}
