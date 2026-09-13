import type { QuestionGroup } from './data'
export const CARD_WIDTH = 330
export const CARD_HEIGHT = 300
export const GAP = 20
export const PADDING = 24
export const HEADER = 64

export function estimateCardHeight(content: string) {
  const textLines = content.split(/\r?\n/).reduce((total, line) => {
    return total + Math.max(1, Math.ceil(line.length / 30))
  }, 0)
  const displayMathBlocks = (content.match(/\$\$|\\\[/g) ?? []).length
  const inlineMath = (content.match(/\$[^$]+\$|\\\([^\n]+\\\)/g) ?? []).length
  const lines = Math.max(5, textLines + displayMathBlocks * 3 + inlineMath)
  return Math.min(1800, Math.max(180, 120 + lines * 25 + displayMathBlocks * 36))
}


interface GroupLayout {
  group: QuestionGroup
  x: number
  y: number
  width: number
  height: number
  columns: number
  cards: { id: string; x: number; y: number; h: number }[]
  children: GroupLayout[]
}

// Pack variable-size rectangles into the lowest available gap, without rows.
function pack(items: { width: number; height: number }[], gap: number) {
  const area = items.reduce((sum, item) => sum + (item.width + gap) * (item.height + gap), 0)
  const target = Math.max(CARD_WIDTH, ...items.map(item => item.width), Math.sqrt(area))
  const placed: { x: number; y: number; width: number; height: number }[] = []
  for (const item of items) {
    const candidates = [0, ...placed.map(rect => rect.x + rect.width + gap)]
    let best = { x: 0, y: Infinity }
    for (const x of candidates) {
      if (x + item.width > target && x !== 0) continue
      let y = 0
      for (const rect of placed) {
        if (x < rect.x + rect.width + gap && x + item.width + gap > rect.x) {
          y = Math.max(y, rect.y + rect.height + gap)
        }
      }
      if (y < best.y || (y === best.y && x < best.x)) best = { x, y }
    }
    placed.push({ ...item, ...best })
  }
  return placed
}

export function layoutGroups(groups: QuestionGroup[], _viewportWidth: number, heights: ReadonlyMap<string, number> = new Map()) {
  const childrenByParent = new Map<string | null, QuestionGroup[]>()
  for (const group of groups) {
    const children = childrenByParent.get(group.parentId) ?? []
    children.push(group)
    childrenByParent.set(group.parentId, children)
  }
  function build(group: QuestionGroup): GroupLayout {
    const children = (childrenByParent.get(group.id) ?? []).map(build)
    const count = Math.max(1, group.questionIds.length)
    const columns = Math.min(count, Math.max(1, Math.ceil(Math.sqrt(count * (CARD_HEIGHT + GAP) / (CARD_WIDTH + GAP)))))
    const bottoms = Array.from({ length: columns }, () => 0)
    const cards = group.questionIds.map(id => {
      const h = heights.get(id) ?? CARD_HEIGHT
      const column = bottoms.indexOf(Math.min(...bottoms))
      const card = { id, x: column * (CARD_WIDTH + GAP), y: bottoms[column]!, h }
      bottoms[column] = card.y + h + GAP
      return card
    })
    const cardBlock = cards.length ? [{ width: columns * (CARD_WIDTH + GAP) - GAP, height: Math.max(...bottoms) - GAP }] : []
    const placements = pack([...cardBlock, ...children.map(child => ({ width: child.width, height: child.height }))], GAP * 2)
    if (cards.length) {
      const origin = placements[0]!
      for (const card of cards) { card.x += origin.x + PADDING; card.y += origin.y + HEADER }
    }
    children.forEach((child, index) => {
      const origin = placements[index + cardBlock.length]!
      child.x = origin.x + PADDING
      child.y = origin.y + HEADER
    })
    const width = Math.max(CARD_WIDTH, ...placements.map(item => item.x + item.width)) + PADDING * 2
    const height = group.collapsed ? HEADER : HEADER + Math.max(0, ...placements.map(item => item.y + item.height)) + PADDING
    return { group, x: 0, y: 0, width, height, columns, cards, children }
  }
  const roots = (childrenByParent.get(null) ?? []).map(build)
  const placements = pack(roots.map(root => ({ width: root.width, height: root.height })), 48)
  const result: GroupLayout[] = []
  function flatten(item: GroupLayout) { result.push(item); item.children.forEach(flatten) }
  roots.forEach((root, index) => { Object.assign(root, { x: placements[index]!.x, y: placements[index]!.y }); flatten(root) })
  return result
}
