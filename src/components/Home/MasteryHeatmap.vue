<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { NHeatmap, NScrollbar } from 'naive-ui'
import { useCategoryStore } from '../../store/category'
import { readBank, readStates } from '../../utils/questionBank'
import { buildMasteryHeatmap, collectMasteryDates } from '../../utils/masteryHeatmap'
import { useMobile } from '../../utils/responsive'

const categoryStore = useCategoryStore()
const { isMobile } = useMobile()
const emit = defineEmits<{ preferredWidth: [width: number] }>()
const heatmapElement = ref<HTMLElement | null>(null)
const availableWidth = ref(0)
// Reserve room for weekday labels; size cells against the actual calendar columns.
const heatmapTheme = computed(() => ({
  rectSizeMedium: `${Math.max(1, Math.min(11, (availableWidth.value - 48) / calendarColumns.value - 2))}px`,
}))
let resizeObserver: ResizeObserver | undefined
onMounted(() => {
  if (!heatmapElement.value) return
  availableWidth.value = heatmapElement.value.clientWidth
  resizeObserver = new ResizeObserver(([entry]) => {
    if (entry) availableWidth.value = entry.contentRect.width
  })
  resizeObserver.observe(heatmapElement.value)
})
onBeforeUnmount(() => resizeObserver?.disconnect())
const range = ref<'recent' | number>('recent')
const dates = ref<number[]>([])
const hasBank = ref(false)
const loading = ref(true)
const loadError = ref(false)
const today = ref(new Date())
const yearOptions = computed(() => {
  const years = new Set([today.value.getFullYear(), ...dates.value.map(date => new Date(date).getFullYear())])
  return [
    { label: '最近一年', value: 'recent' as const },
    ...[...years].sort((a, b) => b - a).map(year => ({ label: `${year} 年`, value: year })),
  ]
})
const data = computed(() => buildMasteryHeatmap(dates.value, range.value, today.value))
const calendarColumns = computed(() => {
  const first = data.value[0]
  if (!first) return 1
  const leadingDays = (new Date(first.timestamp).getDay() + 6) % 7
  return Math.ceil((leadingDays + data.value.length) / 7)
})
watch(calendarColumns, columns => emit('preferredWidth', columns * 13 + 48), { immediate: true })

watch(() => [categoryStore.meta, ...categoryStore.roots.map(root => root.total_completed_count)], async (_value, _oldValue, onCleanup) => {
  let cancelled = false
  onCleanup(() => { cancelled = true })
  loading.value = true
  loadError.value = false
  try {
    const bank = await readBank()
    const states = bank ? await readStates(bank.manifest.questionBank.subjectCode) : {}
    if (cancelled) return
    const result = collectMasteryDates(bank?.questions.map(question => question.id) ?? [], states)
    dates.value = result.dates
    hasBank.value = !!bank?.questions.length
    today.value = new Date()
  } catch (error) {
    if (cancelled) return
    loadError.value = true
    console.error('Failed to load mastery heatmap', error)
  } finally {
    if (!cancelled) loading.value = false
  }
}, { immediate: true, flush: 'post' })
</script>

<template>
  <div ref="heatmapElement" class="mastery-heatmap">
    <div class="heatmap-toolbar">
      <n-text strong>完成热力图</n-text>
      <n-select v-model:value="range" :options="yearOptions" size="small" style="width: 120px" aria-label="热力图日期范围" />
    </div>
    <n-spin :show="loading">
      <n-empty v-if="loadError" description="掌握记录加载失败，请刷新重试" />
      <n-empty v-else-if="!loading && !hasBank" description="暂无题目" />
      <n-flex v-else vertical :size="16">
        <n-scrollbar x-scrollable>
          <n-heatmap
            :data="data"
            :loading-data="data"
            :loading="loading"
            :first-day-of-week="0"
            :fill-calendar-leading="range === 'recent'"
            color-theme="green"
            size="medium"
            :theme-overrides="isMobile ? undefined : heatmapTheme"
            :x-gap="isMobile ? undefined : 2"
            :y-gap="isMobile ? undefined : 2"
            tooltip
          >
            <template #tooltip="{ timestamp, value }">
              {{ new Date(timestamp).toLocaleDateString('zh-CN') }} · 掌握 {{ value ?? 0 }} 题
            </template>
          </n-heatmap>
        </n-scrollbar>
      </n-flex>
    </n-spin>
  </div>
</template>

<style scoped>
.mastery-heatmap {
  min-width: 0;
  padding-top: 20px;
  border-top: 1px solid var(--n-border-color);
}

.heatmap-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
</style>
