<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useMessage } from 'naive-ui'
import { getQuestions } from '../../api/question'
import type { Question } from '../../api/types'
import QuestionCard from '../../components/Question/QuestionCard.vue'
import EmptyState from '../../components/EmptyState.vue'

const route = useRoute()
const message = useMessage()

const questions = ref<Question[]>([])
const loading = ref(false)
const loadingStep = ref(0)
const loadingText = ref('')

const categoryId = computed(() => Number(route.params.categoryId))

const fetchQuestions = async () => {
  loading.value = true
  loadingStep.value = 1
  loadingText.value = '正在拉取题目信息...'
  
  try {
    const firstResponse = await getQuestions(categoryId.value, 1)
    let allItems = [...firstResponse.items]
    const totalPages = firstResponse.pages || 1
    
    if (totalPages > 1) {
      for (let page = 2; page <= totalPages; page++) {
        loadingText.value = `正在拉取题目信息 (第 ${page}/${totalPages} 页)...`
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
    loadingStep.value = 0
    if (route.query.questionId) {
      await nextTick()
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
</script>

<template>
  <EmptyState v-if="!loading && questions.length === 0" page />
  <n-space v-else vertical :size="24">
    <n-page-header>
      <template #title>
        <n-text>题目练习</n-text>
      </template>
      <template #extra>
        <n-flex :size="12">
          <n-statistic label="题目总数" :value="questions.length" />
          <n-statistic 
            label="已掌握" 
            :value="questions.filter(q => q.user_state.is_mastered).length" 
          />
        </n-flex>
      </template>
    </n-page-header>

    <n-spin :show="loading" :description="loadingText">
      <div :style="{ minHeight: loading ? '60vh' : 'auto' }" style="display: flex; flex-direction: column; justify-content: center;">
        <n-space v-if="questions.length > 0 && !loading" vertical :size="16">
          <QuestionCard
            v-for="question in questions"
            :key="question.id"
            :id="`question-${question.id}`"
            :question="question"
            @update-state="handleUpdateState"
          />
        </n-space>
        
      </div>
    </n-spin>
  </n-space>
</template>
