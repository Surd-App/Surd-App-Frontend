import type { BankCategory, LocalBank } from './questionBank'

export interface DirectoryNode {
  name: string
  children: DirectoryNode[]
}

export const directoryPrompt = `请根据我上传的目录图片，按原图顺序和层级整理目录。
只输出一个标记为 json 的 Markdown 代码块，不要输出其他解释。
JSON 顶层必须是数组，每个节点仅包含 name 和 children：
- name：非空字符串，保留原图章节名称和编号，不包含页码。
- children：子目录数组，末级节点使用空数组 []。
- 不要生成 id、题目、答案或其他字段。
- 多张图片合并为一个目录；同一父目录下同名节点合并，保留其子目录。
- 无法辨认的文字请在名称中使用「待确认」，不要编造。
格式示例：
\`\`\`json
[
  {
    "name": "第一章 极限",
    "children": [
      { "name": "第一节 函数", "children": [] },
      { "name": "第二节 数列极限", "children": [] }
    ]
  }
]
\`\`\``

export function parseDirectoryJson(input: string): DirectoryNode[] {
  const source = input.trim().replace(/^\uFEFF/, '')
  const fenced = source.match(/^\x60{3}(?:json)?\s*\n([\s\S]*?)\n\x60{3}$/i)
  let data: unknown
  try {
    data = JSON.parse(fenced ? fenced[1]! : source)
  } catch {
    throw new Error('JSON 格式错误，请粘贴完整数组或一个 JSON Markdown 代码块')
  }
  let count = 0
  function parse(nodes: unknown, depth: number): DirectoryNode[] {
    if (!Array.isArray(nodes)) throw new Error('目录及 children 必须是数组')
    if (depth > 50) throw new Error('目录层级不能超过 50 层')
    return nodes.map(node => {
      if (++count > 5000) throw new Error('单次最多导入 5000 个目录节点')
      if (!node || typeof node !== 'object' || Array.isArray(node) ||
          typeof node.name !== 'string' || !node.name.trim()) {
        throw new Error('每个目录节点必须包含非空的 name 字符串')
      }
      if (Object.keys(node).some(key => key !== 'name' && key !== 'children')) {
        throw new Error('目录节点仅支持 name 和 children 字段')
      }
      return { name: node.name.trim(), children: parse(node.children ?? [], depth + 1) }
    })
  }
  const nodes = parse(data, 0)
  if (!nodes.length) throw new Error('请至少提供一个目录节点')
  return nodes
}

export function directorySignature(bank: LocalBank): string {
  return JSON.stringify({ categories: bank.categories, roots: bank.manifest.questionBank.rootCategoryIds })
}

export function mergeDirectory(bank: LocalBank, nodes: DirectoryNode[]) {
  const categories = [...bank.categories]
  const roots = [...bank.manifest.questionBank.rootCategoryIds]
  const siblings = new Map<number | null, Map<string, BankCategory>>()
  const orders = new Map<number | null, number>()
  let nextId = 0
  for (const category of categories) {
    nextId = Math.max(nextId, category.id)
    const names = siblings.get(category.parentId) ?? new Map<string, BankCategory>()
    const name = category.name.trim()
    // Existing duplicates remain intact; new descendants merge into the first match.
    if (!names.has(name)) names.set(name, category)
    siblings.set(category.parentId, names)
    orders.set(category.parentId, Math.max(orders.get(category.parentId) ?? 0, category.sortOrder))
  }
  const addedIds = new Set<number>()
  function merge(items: DirectoryNode[], parentId: number | null) {
    const names = siblings.get(parentId) ?? new Map<string, BankCategory>()
    siblings.set(parentId, names)
    for (const item of items) {
      let category = names.get(item.name)
      if (!category) {
        if (!Number.isSafeInteger(++nextId)) throw new Error('无法分配章节 ID')
        const sortOrder = (orders.get(parentId) ?? 0) + 1
        category = { id: nextId, parentId, name: item.name, sortOrder, questionIds: [] }
        categories.push(category)
        names.set(item.name, category)
        orders.set(parentId, sortOrder)
        addedIds.add(category.id)
        if (parentId === null) roots.push(category.id)
      }
      merge(item.children, category.id)
    }
  }
  merge(nodes, null)
  const mergedBank: LocalBank = {
    ...bank, categories,
    manifest: { ...bank.manifest,
      questionBank: { ...bank.manifest.questionBank, rootCategoryIds: roots },
      stats: { ...bank.manifest.stats, categoryCount: categories.length },
    },
  }
  return { bank: mergedBank, addedIds }
}
