import { createElement as h, createContext, useContext, useLayoutEffect, useRef, memo, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Tldraw, ShapeUtil, Rectangle2d, HTMLContainer, T, createShapeId, type TLBaseShape, type Editor } from 'tldraw'
import type { CanvasData } from './data'
import { CARD_WIDTH, CARD_HEIGHT, HEADER, estimateCardHeight, layoutGroups } from './layout'
import 'tldraw/tldraw.css'
import './canvas.css'

type Card = TLBaseShape<'question-card', { w: number; h: number; questionId: string; groupId: string }>
type Group = TLBaseShape<'question-group', { w: number; h: number; groupId: string; collapsed: boolean }>
interface Bridge { data: CanvasData; mountContent: (id: string, element: HTMLElement) => () => void; toggle: (id: string) => void }
const Context = createContext<Bridge>(null!)
const CardView = memo(function CardView({ shape }: { shape: Card }) {
  const bridge = useContext(Context)
  const target = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!target.current) return
    const element = target.current
    const unmount = bridge.mountContent(shape.props.questionId, element)
    return () => { unmount() }
  }, [bridge, shape.props.questionId])
  const question = bridge.data.questions.get(shape.props.questionId)
  if (!question) return null
  return h(HTMLContainer, { className: 'qc-card', style: { width: shape.props.w, height: shape.props.h } },
    h('header', null, h('strong', null, `#${question.id}`), h('span', null, bridge.data.labels.get(shape.props.questionId))),
    h('div', { ref: target, className: 'qc-content' }))
})
class QuestionShape extends ShapeUtil<Card> {
  static override type = 'question-card' as const
  static override props = { w: T.number, h: T.number, questionId: T.string, groupId: T.string }
  getDefaultProps() { return { w: CARD_WIDTH, h: CARD_HEIGHT, questionId: '', groupId: '' } }
  getGeometry(shape: Card) { return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true }) }
  override canEdit() { return false }
  override canResize() { return false }
  override canBind() { return false }
  component(shape: Card) { return h(CardView, { shape }) }
  override indicator() { return null }
}
function GroupView({ shape }: { shape: Group }) {
  const { data } = useContext(Context)
  const group = data.groups.find(g => g.id === shape.props.groupId)
  const primary = group?.depth === 0
  return h(HTMLContainer, { className: primary ? 'qc-group qc-primary' : 'qc-group', style: { width: shape.props.w, height: shape.props.h } },
    h('header', null, h('strong', null, group?.title), h('span', null, `${group?.totalQuestions ?? 0} 题`), h('span', null, shape.props.collapsed ? '+' : '−')))
}
class GroupShape extends ShapeUtil<Group> {
  static override type = 'question-group' as const
  static override props = { w: T.number, h: T.number, groupId: T.string, collapsed: T.boolean }
  getDefaultProps() { return { w: 400, h: HEADER, groupId: '', collapsed: false } }
  getGeometry(shape: Group) { return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true }) }
  override canEdit() { return false }
  override canResize() { return false }
  override canBind() { return false }
  component(shape: Group) { return h(GroupView, { shape }) }
  override indicator() { return null }
}
class CanvasError extends Component<{ children: ReactNode; onError: (error: Error) => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { this.props.onError(error) }
  render() { return this.state.failed ? null : this.props.children }
}
export function mountCanvas(element: HTMLElement, config: Omit<Bridge, 'toggle'> & { dark: boolean; heights?: ReadonlyMap<string, number>; onError: (error: Error) => void; onReady: () => void }) {
  const root = createRoot(element)
  let editor: Editor | undefined
  let disposed = false
  let busy = true
  let stopCameraListener: (() => void) | undefined
  let lastZoom = 1
  let detailLevel: 'outline' | 'compact' | 'full' = 'full'
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const hideDetailBelow = coarsePointer ? .82 : .62
  const showDetailAbove = coarsePointer ? .98 : .76
  function applyLod(zoom: number) {
    // Compensate for the canvas transform so borders do not become sub-pixel lines.
    element.style.setProperty('--qc-line-width', `${Math.max(1, 1 / Math.max(zoom, 0.05))}px`)
    // Hysteresis prevents visibility flicker near the threshold. DOM stays mounted.
    const next: typeof detailLevel = detailLevel === 'outline'
      ? (zoom > .28 ? 'compact' : 'outline')
      : detailLevel === 'compact'
        ? (zoom < .18 ? 'outline' : zoom > showDetailAbove ? 'full' : 'compact')
        : (zoom < .18 ? 'outline' : zoom > hideDetailBelow ? 'full' : 'compact')
    if (next === detailLevel) return
    detailLevel = next
    element.dataset.qcDetail = next
  }
  let down: { x: number; y: number } | null = null
  const width = element.clientWidth
  const groupId = (id: string) => createShapeId(`group-${id}`)
  const cardId = (group: string, id: string) => createShapeId(`question-${group}-${id}`)
  const heights = config.heights ?? new Map([...config.data.questions].map(([id, question]) => [id, estimateCardHeight(question.题目内容)]))
  const bridge: Bridge = { ...config, toggle: id => {
    if (!editor || busy) return
    const group = config.data.groups.find(g => g.id === id)
    if (!group) return
    group.collapsed = !group.collapsed
    updateLayout()
  } }
  function updateLayout() {
    if (!editor) return
    const layout = layoutGroups(config.data.groups, width, heights)
    editor.run(() => {
      editor!.updateInstanceState({ isReadonly: false })
      try {
      editor!.updateShapes(layout.map(item => ({ id: groupId(item.group.id), type: 'question-group' as const,
        x: item.x, y: item.y, props: { w: item.width, h: item.height, collapsed: item.group.collapsed } })))
      const updates = []
      for (const item of layout) {
        for (const card of item.cards) {
          const id = cardId(item.group.id, card.id)
          const current = editor!.getShape<Card>(id)
          if (current && (current.x !== card.x || current.y !== card.y || current.props.h !== card.h)) {
            updates.push({ id, type: 'question-card' as const, x: card.x, y: card.y, props: { h: card.h } })
          }
        }
      }
      editor!.updateShapes(updates)
      } finally { editor!.updateInstanceState({ isReadonly: true }) }
    }, { ignoreShapeLock: true })
  }
  async function initialize(instance: Editor) {
    editor = instance
    try {
      const layout = layoutGroups(config.data.groups, width, heights)
      editor.createShapes(layout.map(item => ({ id: groupId(item.group.id), type: 'question-group' as const,
        parentId: item.group.parentId ? groupId(item.group.parentId) : editor!.getCurrentPageId(),
        x: item.x, y: item.y, props: { groupId: item.group.id, w: item.width, h: item.height, collapsed: false } })))
      const cards = layout.flatMap(item => item.cards.map(card => ({
        id: cardId(item.group.id, card.id), type: 'question-card' as const, parentId: groupId(item.group.id),
        x: card.x, y: card.y,
        props: { questionId: card.id, groupId: item.group.id, w: CARD_WIDTH, h: card.h },
      })))
      for (let i = 0; i < cards.length; i += 200) {
        if (disposed) return
        editor.createShapes(cards.slice(i, i + 200))
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      }
      if (disposed) return
      editor.updateInstanceState({ isReadonly: true })
      editor.setCurrentTool('hand')
      editor.setCamera({ x: 32, y: 32, z: Math.min(1, width / 1100) })
      lastZoom = editor.getZoomLevel()
      applyLod(lastZoom)
      // One listener for the canvas, not one reactive camera/culling subscription per card.
      stopCameraListener = editor.store.listen(() => {
        const zoom = instance.getZoomLevel()
        if (zoom === lastZoom) return
        lastZoom = zoom
        if (!disposed) applyLod(lastZoom)
      })
      busy = false
      config.onReady()
    } catch (error) { if (!disposed) config.onError(error instanceof Error ? error : new Error(String(error))) }
  }
  const pointerDown = (event: PointerEvent) => {
    if (event.button === 2) {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    if (event.button === 0) down = { x: event.clientX, y: event.clientY }
  }
  const pointerUpBlock = (event: PointerEvent) => {
    if (event.button === 2) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  const contextMenu = (event: MouseEvent) => event.preventDefault()
  const pointerUp = (event: PointerEvent) => {
    const start = down; down = null
    if (!start || !editor || busy || Math.hypot(event.clientX-start.x,event.clientY-start.y) > 5) return
    const point = editor.screenToPage({ x: event.clientX, y: event.clientY })
    const shape = editor.getShapeAtPoint(point, { hitInside: true })
    if (shape?.type === 'question-group') {
      const bounds = editor.getShapePageBounds(shape)
      if (bounds && point.y <= bounds.y + HEADER) bridge.toggle((shape as Group).props.groupId)
    }
  }
  element.addEventListener('pointerdown', pointerDown, true)
  element.addEventListener('pointerup', pointerUp, true)
  element.addEventListener('pointerup', pointerUpBlock, true)
  element.addEventListener('contextmenu', contextMenu, true)
  document.addEventListener('contextmenu', contextMenu, true)
  function render(dark: boolean) {
    const canvas = h(Tldraw, { hideUi: true, shapeUtils: [QuestionShape, GroupShape], initialState: 'hand',
        options: { maxShapesPerPage: 20000 }, cameraOptions: { wheelBehavior: 'zoom', zoomSteps: [.05,.1,.2,.35,.5,.7,1,1.5,2,4] },
        getShapeVisibility: (shape, instance) => {
          if (shape.type !== 'question-card' && shape.type !== 'question-group') return 'inherit'
          let parent = instance.getShape(shape.parentId)
          while (parent) {
            if (parent.type === 'question-group' && (parent as Group).props.collapsed) return 'hidden'
            parent = instance.getShape(parent.parentId)
          }
          return 'inherit'
        }, onMount: instance => { instance.user.updateUserPreferences({ colorScheme: dark ? 'dark' : 'light' }); void initialize(instance) },
    })
    const provider = h(Context.Provider, { value: bridge }, canvas)
    root.render(h(CanvasError, { onError: config.onError, children: provider }))
  }
  render(config.dark)
  return {
    setDark(dark: boolean) { editor?.user.updateUserPreferences({ colorScheme: dark ? 'dark' : 'light' }) },
    fit() { editor?.zoomToFit({ animation: { duration: 250 } }) },
    destroy() { disposed = true; stopCameraListener?.(); root.unmount(); delete element.dataset.qcDetail; element.style.removeProperty('--qc-line-width'); element.removeEventListener('pointerdown',pointerDown,true); element.removeEventListener('pointerup',pointerUp,true); element.removeEventListener('pointerup',pointerUpBlock,true); element.removeEventListener('contextmenu',contextMenu,true); document.removeEventListener('contextmenu',contextMenu,true) },
  }
}
