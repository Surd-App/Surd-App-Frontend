<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { getFavoriteQuestions } from '../../api/question'
import type { Question } from '../../api/types'
import QuestionCard from '../../components/Question/QuestionCard.vue'
import EmptyState from '../../components/EmptyState.vue'
import ArrowCounterclockwise24Regular from '@vicons/fluent/es/ArrowCounterclockwise24Regular'

const message = useMessage()
const questions = ref<Question[]>([])
const loading = ref(false)
const loadingStep = ref(0)
const loadingText = ref('')

const showRefreshBtn = ref(false)
const hasNotified = ref(false)

const fetchFavorites = async () => {
  loading.value = true
  loadingStep.value = 1
  loadingText.value = '正在拉取题目信息...'
  
  try {
    const response = await getFavoriteQuestions()
    
    questions.value = response.items
    message.success(`成功加载 ${response.total} 道收藏题目`)
    showRefreshBtn.value = false
    hasNotified.value = false
  } catch (error) {
    message.error('加载收藏本失败')
    console.error(error)
  } finally {
    loading.value = false
    loadingStep.value = 0
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
    if (state.is_favorite !== undefined && state.is_favorite !== question.user_state.is_favorite) {
      if (!hasNotified.value) {
        message.info('防止误操作，通过此处标记变更的题目不会立即消失，你可以手动点击右下角刷新按钮更新列表', { 
          duration: 5000,
          closable: false 
        })
        hasNotified.value = true
        showRefreshBtn.value = true
      }
    }
    Object.assign(question.user_state, state)
  }
}

onMounted(() => {
  fetchFavorites()
})
</script>

<template>
  <EmptyState v-if="!loading && questions.length === 0" page />
  <n-space v-else vertical :size="24">
    <n-spin :show="loading" :description="loadingText">
      <div :style="{ minHeight: loading ? '60vh' : 'auto' }" style="display: flex; flex-direction: column; justify-content: center;">
        <n-space v-if="questions.length > 0 && !loading" vertical :size="16">
          <QuestionCard
            v-for="question in questions"
            :key="question.id"
            :question="question"
            show-path
            @update-state="handleUpdateState"
          />
        </n-space>
        
      </div>
    </n-spin>

    <n-float-button
      v-if="showRefreshBtn"
      :right="40"
      :bottom="40"
      width="56"
      height="56"
      type="primary"
      @click="fetchFavorites"
    >
      <n-icon size="28">
        <ArrowCounterclockwise24Regular />
      </n-icon>
    </n-float-button>
  </n-space>
</template>
