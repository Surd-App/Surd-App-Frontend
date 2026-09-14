<script setup lang="ts">
import { computed, shallowRef, onMounted, onBeforeUnmount, ref, watch, createApp, nextTick } from 'vue'
import { useThemeVars } from 'naive-ui'
import { useRoute } from 'vue-router'
import { useThemeStore } from '../../store/theme'
import { loadCanvasData, type CanvasData } from '../../canvas/data'
import { mountCanvas } from '../../canvas/engine'
import { CARD_WIDTH } from '../../canvas/layout'
import QuestionContent from '../../components/Question/QuestionContent.vue'
import EmptyState from '../../components/EmptyState.vue'
import '../../canvas/canvas.css'

const route = useRoute()
const themeStore = useThemeStore()
const host = ref<HTMLElement | null>(null)
const loading = ref(true)
const error = ref('')
const ready = ref(false)
const data = shallowRef<CanvasData>()
const theme = useThemeVars()
const tokens = computed(() => ({
  '--qc-card-background': theme.value.cardColor, '--qc-border': theme.value.borderColor,
  '--qc-text': theme.value.textColor1, '--qc-muted': theme.value.textColor3,
  '--qc-accent': theme.value.primaryColor, '--qc-divider': theme.value.dividerColor,
  '--canvas-background': theme.value.bodyColor,
}))
// Reuse the exact shared-renderer HTML produced during initial measurement.
const renderedCards = new Map<string, string>()
const mobileCanvas = window.matchMedia('(pointer: coarse)').matches
let disposed = false
let canvas: ReturnType<typeof mountCanvas> | undefined
function mountContent(id: string, element: HTMLElement) {
  // Called once per mounted Shape, never for pan, culling or LOD changes.
  element.innerHTML = renderedCards.get(id) ?? ''
  return () => element.replaceChildren()
}
async function open() {
  try {
    loading.value = true; error.value = ''
    data.value = await loadCanvasData(Number(route.params.categoryId))
    if (disposed) return
    const heights = await measureCards(data.value)
    if (disposed) return
    loading.value = false
    if (!data.value.questions.size) { ready.value = true; return }
    canvas = mountCanvas(host.value!, {
      data: data.value, heights, dark: themeStore.isDark, mountContent,
      onError: reason => { error.value = reason.message }, onReady: () => { ready.value = true },
    })
  } catch (reason) { loading.value = false; error.value = reason instanceof Error ? reason.message : '题目画布加载失败' }
}
async function measureCards(bank: CanvasData) {
  const measuringHost = document.createElement('div')
  measuringHost.className = 'question-canvas-measure'
  host.value!.appendChild(measuringHost)
  const heights = new Map<string, number>()
  const questions = [...bank.questions]
  const batchSize = mobileCanvas ? 6 : 24
  try {
    for (let offset = 0; offset < questions.length; offset += batchSize) {
      if (disposed) return heights
      const records: { id: string; element: HTMLElement; app: ReturnType<typeof createApp> }[] = []
      try {
        for (const [id, question] of questions.slice(offset, offset + batchSize)) {
          const element = document.createElement('div')
          element.className = 'qc-card'
          element.style.width = `${CARD_WIDTH}px`
          element.style.height = 'auto'
          const header = document.createElement('header')
          const number = document.createElement('strong')
          number.textContent = `#${question.id}`
          const label = document.createElement('span')
          label.textContent = bank.labels.get(id) ?? ''
          header.append(number, label)
          const content = document.createElement('div')
          content.className = 'qc-content'
          element.append(header, content)
          measuringHost.appendChild(element)
          const app = createApp(QuestionContent, { question })
          records.push({ id, element, app })
          app.mount(content)
        }
        await nextTick()
        await Promise.all([...measuringHost.querySelectorAll('img')].map(img => img.decode().catch(() => undefined)))
        await document.fonts.ready
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        if (disposed) return heights
        // Map keys are question IDs, never array indices. Measure the complete card at 1:1 scale.
        for (const { id, element } of records) {
          heights.set(id, Math.ceil(element.getBoundingClientRect().height))
          renderedCards.set(id, element.querySelector('.qc-content')!.innerHTML)
        }
      } finally {
        records.forEach(({ app, element }) => { app.unmount(); element.remove() })
      }
    }
  } finally {
    measuringHost.remove()
  }
  return heights
}
onMounted(() => { void open() })
watch(() => themeStore.isDark, dark => canvas?.setDark(dark))
onBeforeUnmount(() => { disposed = true; canvas?.destroy(); renderedCards.clear() })
</script>
<template>
  <div class="question-canvas-page" :style="tokens">
    <n-alert v-if="error" type="error" :title="error" style="margin: 12px 0" />
    <EmptyState v-if="ready && !data?.questions.size" />
    <n-spin v-show="!ready || !!data?.questions.size" :show="loading || (!ready && !error)" description="正在构建题目知识画布...">
      <div ref="host" class="question-canvas-host" />
    </n-spin>
  </div>
</template>
