<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { ChevronLeft24Regular, ChevronRight24Regular } from '@vicons/fluent'
import { getQuestions } from '../../api/question'
import type { Category, Question } from '../../api/types'
import QuestionCard from '../../components/Question/QuestionCard.vue'
import EmptyState from '../../components/EmptyState.vue'
import { useCategoryStore } from '../../store/category'
import { readBank } from '../../utils/questionBank'
import { saveLastPracticeProgress } from '../../utils/practiceProgress'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const categoryStore = useCategoryStore()

const questions = ref<Question[]>([])
const loading = ref(true)
const loadingText = ref('')
const questionListRef = ref<HTMLElement | null>(null)
const activeBankId = ref('')
let progressObserver: IntersectionObserver | undefined
let progressTimer: number | undefined
let pendingProgressIndex: number | null = null
let savedProgressKey = ''

const categoryId = computed(() => Number(route.params.categoryId))
const currentCategory = computed(() => categoryStore.getCategoryData(categoryId.value))
const practiceCategories = computed(() => {
  const result: Category[] = []
  const visit = (category: Category) => {
    if (category.question_count > 0) result.push(category)
    category.children.forEach(visit)
  }
  categoryStore.roots.forEach(visit)
  return result
})
const currentCategoryIndex = computed(() =>
  practiceCategories.value.findIndex(category => category.id === categoryId.value))
const previousCategory = computed(() => {
  const index = currentCategoryIndex.value
  return index > 0 ? practiceCategories.value[index - 1] ?? null : null
})
const nextCategory = computed(() => {
  const index = currentCategoryIndex.value
  return index >= 0 ? practiceCategories.value[index + 1] ?? null : null
})

function scrollToQuestion(index: number) {
  scheduleProgressSave(index)
  document.getElementById(`practice-question-${index + 1}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

function writeProgress(index: number) {
  const question = questions.value[index]
  if (!question || !activeBankId.value) return
  const key = `${categoryId.value}:${question.id}`
  if (key === savedProgressKey) return
  savedProgressKey = key
  pendingProgressIndex = null
  void saveLastPracticeProgress({
    bankId: activeBankId.value,
    categoryId: categoryId.value,
    questionId: question.id,
    questionNumber: index + 1,
  }).catch(error => console.error('Failed to save practice progress:', error))
}

function scheduleProgressSave(index: number) {
  pendingProgressIndex = index
  if (progressTimer !== undefined) window.clearTimeout(progressTimer)
  progressTimer = window.setTimeout(() => {
    progressTimer = undefined
    writeProgress(index)
  }, 250)
}

function observePracticeProgress() {
  progressObserver?.disconnect()
  if (!questionListRef.value || !('IntersectionObserver' in window)) {
    writeProgress(0)
    return
  }
  const visibility = new Map<Element, number>()
  progressObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) visibility.set(entry.target, entry.intersectionRatio)
      else visibility.delete(entry.target)
    }
    const current = [...visibility.entries()].sort((left, right) => right[1] - left[1])[0]
    if (!current) return
    const index = Number((current[0] as HTMLElement).dataset.questionIndex)
    if (Number.isInteger(index)) scheduleProgressSave(index)
  }, { threshold: [0, 0.25, 0.5, 0.75, 1] })
  questionListRef.value.querySelectorAll<HTMLElement>('.question-anchor')
    .forEach(element => progressObserver?.observe(element))
}

function openCategory(category: Category | null) {
  if (category) void router.push(`/practice/${category.id}`)
}

const fetchQuestions = async () => {
  loading.value = true
  loadingText.value = '正在读取题目信息...'
  
  try {
    const [firstResponse, bank] = await Promise.all([
      getQuestions(categoryId.value, 1),
      readBank(),
    ])
    activeBankId.value = bank?.manifest.questionBank.id ?? ''
    let allItems = [...firstResponse.items]
    const totalPages = firstResponse.pages || 1
    
    if (totalPages > 1) {
      for (let page = 2; page <= totalPages; page++) {
        loadingText.value = `正在读取题目信息 (第 ${page}/${totalPages} 页)...`
        const response = await getQuestions(categoryId.value, page)
        allItems = [...allItems, ...response.items]
      }
    }
    
    questions.value = allItems
    message.success(`成功加载 ${firstResponse.total} 道题目`)
  } catch (error) {
    message.error('加载题目失败，请重试')
    console.error('Failed to fetch questions:', error)
  } finally {
    loading.value = false
    await nextTick()
    observePracticeProgress()
    if (route.query.questionId) {
      document.getElementById('question-' + String(route.query.questionId))?.scrollIntoView({ block: 'center' })
    }
  }
}

const handleUpdateState = (questionId: number, state: Partial<{
  is_favorite: boolean
  is_wrong_book: boolean
  is_mastered: boolean
  note: string
}>) => {
  const question = questions.value.find(q => q.id === questionId)
  if (question) {
    Object.assign(question.user_state, state)
  }
}

onMounted(() => {
  fetchQuestions()
})

onBeforeUnmount(() => {
  progressObserver?.disconnect()
  if (progressTimer !== undefined) window.clearTimeout(progressTimer)
  if (pendingProgressIndex !== null) writeProgress(pendingProgressIndex)
})
</script>

<template>
  <EmptyState v-if="!loading && questions.length === 0" page />
  <n-spin v-else class="practice-loading" :show="loading" :description="loadingText">
    <div :class="{ 'practice-layout': !loading }">
      <aside v-if="!loading" class="chapter-overview-column">
        <n-card size="small" class="chapter-overview-card">
          <template #header>
            <n-flex vertical :size="4">
              <n-text strong>章节总览</n-text>
              <n-text depth="3" class="chapter-name">
                {{ currentCategory?.name }}
              </n-text>
            </n-flex>
          </template>
          <n-scrollbar class="question-number-scroll">
            <div class="question-number-grid">
              <n-button
                v-for="(_question, index) in questions"
                :key="index"
                size="small"
                :type="_question.user_state.is_wrong_book ? 'error' : (_question.user_state.is_mastered ? 'success' : 'default')"
                :secondary="_question.user_state.is_wrong_book || _question.user_state.is_mastered"
                :aria-label="`前往第 ${index + 1} 题`"
                @click="scrollToQuestion(index)"
              >
                {{ index + 1 }}
              </n-button>
            </div>
          </n-scrollbar>

          <template #footer>
            <n-flex justify="space-between" :wrap="false" :size="8">
              <n-button
                size="small"
                secondary
                :disabled="!previousCategory"
                :title="previousCategory?.name"
                @click="openCategory(previousCategory)"
              >
                <template #icon><n-icon><ChevronLeft24Regular /></n-icon></template>
                上一节
              </n-button>
              <n-button
                size="small"
                secondary
                :disabled="!nextCategory"
                :title="nextCategory?.name"
                @click="openCategory(nextCategory)"
              >
                下一节
                <template #icon><n-icon><ChevronRight24Regular /></n-icon></template>
              </n-button>
            </n-flex>
          </template>
        </n-card>
      </aside>

      <div v-if="questions.length > 0 && !loading" ref="questionListRef" class="question-list">
        <div
          v-for="(question, index) in questions"
          :id="`practice-question-${index + 1}`"
          :key="question.id"
          :data-question-index="index"
          class="question-anchor"
        >
          <QuestionCard
            :id="`question-${question.id}`"
            :question="question"
            @update-state="handleUpdateState"
          />
        </div>
      </div>

      <div v-else class="loading-placeholder" />
    </div>
  </n-spin>
</template>

<style scoped>
.practice-loading,
.loading-placeholder {
  min-height: calc(100dvh - 112px);
}

.practice-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  align-items: start;
  gap: 16px;
  min-width: 0;
}

.chapter-overview-column {
  position: sticky;
  top: 24px;
  min-width: 0;
}

.chapter-overview-card {
  max-height: calc(100dvh - 112px);
  text-align: left;
}

.chapter-overview-card :deep(.n-card__content) {
  display: flex;
  min-height: 0;
}

.chapter-name {
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.question-number-scroll {
  max-height: calc(100dvh - 220px);
  width: 100%;
}

.question-number-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding-right: 8px;
}

.question-number-grid .n-button {
  width: 100%;
  padding-inline: 0;
  font-variant-numeric: tabular-nums;
}

.question-list {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.question-anchor {
  scroll-margin-top: 16px;
}

@media (width < 768px) {
  .practice-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .chapter-overview-column {
    position: static;
  }

  .chapter-overview-card {
    max-height: none;
  }

  .question-number-scroll {
    max-height: 180px;
  }

  .question-number-grid {
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
  }
}
</style>
