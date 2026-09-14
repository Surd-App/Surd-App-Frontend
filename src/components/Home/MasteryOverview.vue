<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MasteryHeatmap from './MasteryHeatmap.vue'
import { NScrollbar, NTab, NTabs, useThemeVars } from 'naive-ui'
import { Rocket24Regular, History24Regular, Target24Regular, Star24Regular } from '@vicons/fluent'
import { useCategoryStore } from '../../store/category'
import type { UserQuestionState } from '../../api/types'
import type { LocalBank } from '../../utils/questionBank'
import { collectMasteryDates } from '../../utils/masteryHeatmap'

const props = defineProps<{
  bank: LocalBank | null
  states: Record<number, UserQuestionState>
}>()

const categoryStore = useCategoryStore()
const themeVars = useThemeVars()
const heatmapWidth = ref(0)
const masteredIds = computed(() => new Set(Object.entries(props.states)
  .filter(([, state]) => state.is_mastered)
  .map(([id]) => Number(id))))
const masteryDates = computed(() => collectMasteryDates(
  props.bank?.questions.map(question => question.id) ?? [],
  props.states,
).dates)
const masteryTotal = computed(() => props.bank?.questions.length ?? 0)
const masteryCount = computed(() => props.bank?.questions.filter(question => masteredIds.value.has(question.id)).length ?? 0)
const masteryRate = computed(() => masteryTotal.value ? Math.round(masteryCount.value / masteryTotal.value * 100) : 0)
const rootProgress = computed(() => categoryStore.roots.map(root => ({
  id: root.id,
  name: root.name,
  mastered: root.total_completed_count,
  total: root.total_question_count,
})))
const activeRoot = ref<number | 'all'>('all')
const questionGroups = computed(() => {
  const groups = new Map<number, Set<number>>()
  const categories = props.bank?.categories ?? []
  const byParent = new Map<number | null, typeof categories>()
  for (const category of categories) {
    const siblings = byParent.get(category.parentId) ?? []
    siblings.push(category)
    byParent.set(category.parentId, siblings)
  }
  const byId = new Map(categories.map(category => [category.id, category]))
  for (const rootId of props.bank?.manifest.questionBank.rootCategoryIds ?? []) {
    const ids = new Set<number>()
    const root = byId.get(rootId)
    const pending = root ? [root] : []
    while (pending.length) {
      const category = pending.pop()!
      category.questionIds.forEach(id => ids.add(id))
      pending.push(...(byParent.get(category.id) ?? []))
    }
    groups.set(rootId, ids)
  }
  return groups
})
const visibleQuestions = computed(() => {
  const questions = (props.bank?.questions ?? []).map((question, index) => ({ question, number: index + 1 }))
  if (activeRoot.value === 'all') return questions
  const ids = questionGroups.value.get(activeRoot.value)
  return questions.filter(({ question }) => ids?.has(question.id))
})
const renderedCount = ref(0)
const renderedQuestions = computed(() => visibleQuestions.value.slice(0, renderedCount.value))
// Keep each DOM update small so navigation and progress animations can continue.
watch(visibleQuestions, questions => {
  renderedCount.value = Math.min(160, questions.length)
}, { flush: 'sync' })
watch([visibleQuestions, renderedCount], ([questions, count], _previous, onCleanup) => {
  if (count >= questions.length) return
  const timer = window.setTimeout(() => {
    renderedCount.value = Math.min(count + 160, questions.length)
  }, 16)
  onCleanup(() => window.clearTimeout(timer))
}, { flush: 'post' })
const activeRootName = computed(() => activeRoot.value === 'all'
  ? '全部题目'
  : categoryStore.roots.find(root => root.id === activeRoot.value)?.name ?? '全部题目')
watch(questionGroups, groups => {
  if (activeRoot.value !== 'all' && !groups.has(activeRoot.value)) activeRoot.value = 'all'
})

const completedSections = computed(() => categoryStore.roots.reduce((count, root) =>
  count + root.children.filter(child => child.total_question_count > 0 &&
    child.total_completed_count === child.total_question_count).length, 0))
const statsData = computed(() => [
  { label: '题目总量', value: masteryTotal.value, icon: Rocket24Regular, color: '#2080f0' },
  { label: '已经拿下', value: masteryCount.value, icon: History24Regular, color: '#18a058' },
  { label: '待练习', value: masteryTotal.value - masteryCount.value, icon: Target24Regular, color: '#f0a020' },
  { label: '完成章节', value: completedSections.value, icon: Star24Regular, color: '#8a63d2' },
])

</script>

<template>
  <n-card title="题目掌握总览" :segmented="{ content: true }">
    <div class="mastery-content">
        <n-empty v-if="!masteryTotal" description="当前题库为空，或未选择任何题库" />
        <div v-else-if="bank" class="mastery-overview" :style="{ '--heatmap-width': heatmapWidth ? `${heatmapWidth}px` : 'max-content' }">
          <div class="mastery-left">
            <div class="rings-panel">
              <n-progress type="circle" :percentage="masteryRate" class="mastery-ring">
                <div class="ring-label">
                  <strong>{{ masteryRate }}%</strong>
                  <n-text depth="3">已掌握</n-text>
                </div>
              </n-progress>
              <div class="ring-legend">
                <div v-for="item in rootProgress" :key="item.id" class="legend-row">
                  <n-text class="legend-name" :title="item.name">{{ item.name }}</n-text>
                  <n-text depth="3" class="legend-count">{{ item.mastered }} / {{ item.total }}</n-text>
                </div>
              </div>
            </div>
            <div class="stats-grid">
              <div v-for="item in statsData" :key="item.label" class="stat-item">
                <n-icon :size="22" :color="item.color" class="stat-icon">
                  <component :is="item.icon" />
                </n-icon>
                <div class="stat-content">
                  <n-text depth="3" class="stat-label">{{ item.label }}</n-text>
                  <n-text strong class="stat-value"><n-number-animation :from="0" :to="item.value" /></n-text>
                </div>
              </div>
            </div>
            <MasteryHeatmap
              :dates="masteryDates"
              :has-bank="masteryTotal > 0"
              @preferred-width="heatmapWidth = $event"
            />
          </div>
          <div class="mastery-summary">
            <n-tabs v-model:value="activeRoot" type="line" size="small" class="question-tabs">
              <n-tab name="all">全部</n-tab>
              <n-tab v-for="root in categoryStore.roots" :key="root.id" :name="root.id">{{ root.name }}</n-tab>
            </n-tabs>
            <n-text strong>{{ activeRootName }} · {{ visibleQuestions.length }} 题</n-text>
            <div class="question-status-scroll">
              <n-scrollbar :key="activeRoot" class="question-scrollbar">
              <n-empty v-if="!visibleQuestions.length" description="该章节暂无题目" />
              <div v-else class="question-status-grid" tabindex="0" role="list" :aria-label="`${activeRootName}掌握状态，每个圆点代表一道题目，可滚动查看`">
                <span
                  v-for="{ question, number } in renderedQuestions"
                  :key="question.id"
                  class="question-dot"
                  :class="{ mastered: masteredIds.has(question.id) }"
                  role="listitem"
                  :title="`第 ${number} 题（ID: ${question.id}）：${masteredIds.has(question.id) ? '已掌握' : '未掌握'}`"
                  :aria-label="`第 ${number} 题：${masteredIds.has(question.id) ? '已掌握' : '未掌握'}`"
                />
              </div>
              </n-scrollbar>
            </div>
          </div>
        </div>
    </div>
  </n-card>
</template>

<style scoped>
.mastery-content {
  min-height: 190px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.mastery-overview {
  display: grid;
  grid-template-columns: minmax(0, var(--heatmap-width)) minmax(120px, 1fr);
  gap: 28px;
  align-items: stretch;
}

.rings-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 20px;
  min-width: 0;
}

.mastery-ring {
  width: 142px;
  flex: 0 0 142px;
}

.ring-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.ring-label strong {
  font-size: 28px;
  line-height: 1;
}

.ring-legend {
  flex: 1 1 160px;
  min-width: 0;
}

.legend-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.legend-row + .legend-row {
  margin-top: 5px;
}

.legend-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legend-count {
  flex-shrink: 0;
  font-size: 12px;
}

.mastery-left {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px 8px;
  padding-top: 20px;
  border-top: 1px solid var(--n-border-color);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  text-align: center;
}

.stat-icon {
  flex-shrink: 0;
}

.stat-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  gap: 6px;
}

.stat-label {
  font-size: 12px;
}

.stat-value {
  font-size: 24px;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.mastery-summary {
  padding-left: 28px;
  border-left: 1px solid var(--n-border-color);
  min-width: 0;
  min-height: 0;
  /* Let the left column determine the grid row height. */
  contain: size;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.question-status-scroll {
  position: relative;
  flex: 1;
  min-height: 0;
}

.question-tabs {
  min-width: 0;
  flex-shrink: 0;
}

.question-scrollbar {
  position: absolute;
  inset: 0;
}

.question-status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 8px);
  gap: 4px;
  padding: 4px 12px 4px 4px;
}

.question-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  background: v-bind('themeVars.railColor');
}

.question-dot.mastered {
  background: #18a058;
}

@media (width < 768px) {
  .mastery-summary {
    contain: none;
    padding-left: 0;
    padding-top: 20px;
    border-left: 0;
    border-top: 1px solid var(--n-border-color);
  }

  .question-status-scroll {
    flex: none;
    height: 240px;
  }

  .mastery-overview {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
}
</style>
