<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { Question, UserQuestionState } from '../../api/types'
import { 
  Video24Regular, 
  Note24Regular, 
  Heart24Regular,
  Heart24Filled,
  Checkmark24Regular,
  BookmarkMultiple24Regular,
  BookmarkMultiple24Filled
} from '@vicons/fluent'
import QuestionContent from './QuestionContent.vue'
import LatexRender from '../Latex/LatexRender.vue'
import { toggleFavorite as apiToggleFavorite, toggleWrongBook as apiToggleWrongBook, toggleMastered as apiToggleMastered, saveQuestionNote } from '../../api/question'
import { useMessage } from 'naive-ui'
import NoteModal from '../Interaction/NoteModal.vue'
import { useCategoryStore } from '../../store/category'
import { useMobile } from '../../utils/responsive'

const { isMobile } = useMobile()

const props = defineProps<{
  question: Question
  showPath?: boolean
}>()

const categoryStore = useCategoryStore()
const pathNames = computed(() => {
  if (!props.showPath) return []
  return categoryStore.findCategoryPath(props.question.category_id).map(c => c.name)
})

const emit = defineEmits<{
  updateState: [questionId: number, state: Partial<UserQuestionState>]
}>()

const message = useMessage()
const showAnswer = ref(false)
const showAnalysis = ref(false)

const loadingFavorite = ref(false)
const loadingWrongBook = ref(false)
const loadingMastered = ref(false)

const showNoteModal = ref(false)
const savingNote = ref(false)

// 响应式路径逻辑
const pathWrapperRef = ref<HTMLElement | null>(null)
const pathContentRef = ref<any>(null)
const isPathCollapsed = ref(false)

const checkPathOverflow = () => {
  if (!pathWrapperRef.value || !pathContentRef.value) return
  
  const wrapper = pathWrapperRef.value
  const content = pathContentRef.value.$el || pathContentRef.value
  
  if (!isPathCollapsed.value) {
    if (content.scrollWidth > wrapper.clientWidth) {
      isPathCollapsed.value = true
    }
  }
}

watch(() => props.question.id, () => {
  isPathCollapsed.value = false
  setTimeout(checkPathOverflow, 0)
})

onMounted(() => {
  setTimeout(checkPathOverflow, 500)
  window.addEventListener('resize', checkPathOverflow)
})

const toggleFavorite = async () => {
  loadingFavorite.value = true
  try {
    const res = await apiToggleFavorite(props.question.id)
    const newState = res.is_favorite
    emit('updateState', props.question.id, { is_favorite: newState })
    message.success(newState ? '已添加到收藏' : '已取消收藏')
  } catch (error) {
    message.error('操作失败')
  } finally {
    loadingFavorite.value = false
  }
}

const toggleWrongBook = async () => {
  loadingWrongBook.value = true
  try {
    const res = await apiToggleWrongBook(props.question.id)
    const newState = res.is_wrong_book
    emit('updateState', props.question.id, { is_wrong_book: newState })
    message.success(newState ? '已添加到错题本' : '已从错题本移除')
  } catch (error) {
    message.error('操作失败')
  } finally {
    loadingWrongBook.value = false
  }
}

const toggleMastered = async () => {
  loadingMastered.value = true
  try {
    const res = await apiToggleMastered(props.question.id)
    const newState = res.is_mastered
    categoryStore.updateCategoryCounts(props.question.category_id, newState ? 1 : -1)
    
    emit('updateState', props.question.id, { is_mastered: newState, mastered_at: res.mastered_at })
    message.success(newState ? '已标记为已掌握' : '已取消掌握标记')
  } catch (error) {
    message.error('操作失败')
  } finally {
    loadingMastered.value = false
  }
}

const handleNote = () => {
  showNoteModal.value = true
}

const handleSaveNote = async (note: string) => {
  savingNote.value = true
  try {
    await saveQuestionNote(props.question.id, note)
    emit('updateState', props.question.id, { note })
    message.success('笔记保存成功')
    showNoteModal.value = false
  } catch (error) {
    message.error('笔记保存失败，请重试')
  } finally {
    savingNote.value = false
  }
}

const handleVideo = () => {
  if (props.question.video_url) {
    window.open(props.question.video_url, '_blank')
  }
}

const toggleAnswer = () => {
  showAnswer.value = !showAnswer.value
}

const toggleAnalysis = () => {
  showAnalysis.value = !showAnalysis.value
}
</script>

<template>
  <n-card>
    <n-space vertical :size="16">
      <template v-if="isMobile">
        <n-flex vertical :size="8">
          <div v-if="showPath && pathNames.length > 0" ref="pathWrapperRef" style="overflow: hidden; width: 100%;">
            <n-flex 
              ref="pathContentRef" 
              :size="4" 
              align="center" 
              :wrap="false" 
              style="font-size: 13px; color: var(--n-text-color-3); white-space: nowrap;"
            >
              <template v-if="!isPathCollapsed">
                <template v-for="(name, index) in pathNames" :key="index">
                  <span>{{ name }}</span>
                  <span v-if="index < pathNames.length - 1" style="margin: 0 4px; opacity: 0.5;">/</span>
                </template>
              </template>
              <template v-else>
                <span>... / {{ pathNames[pathNames.length - 1] }}</span>
              </template>
            </n-flex>
          </div>

          <n-flex align="center" justify="start" :size="8" :wrap="false">
            <n-flex align="center" :size="6" style="flex-shrink: 0;">
              <n-tag type="primary" :bordered="false" size="small">
                第 {{ question.题号 }} 题
              </n-tag>
              <n-tag v-if="question.是否选做 === '是'" type="warning" size="small" :bordered="false">
                选做
              </n-tag>
            </n-flex>
            <n-text depth="3" style="font-size: 13px; text-align: left;" ellipsis>{{ question.题源 }}</n-text>
          </n-flex>
        </n-flex>
      </template>

      <template v-else>
        <n-flex justify="space-between" align="center">
          <n-flex vertical :size="8">
            <n-breadcrumb v-if="showPath && pathNames.length > 0" style="font-size: 12px; margin-bottom: 4px; max-width: 400px; white-space: nowrap; overflow: hidden;">
              <n-breadcrumb-item v-for="(name, index) in pathNames" :key="index">
                <n-ellipsis style="max-width: 100px">
                  {{ name }}
                </n-ellipsis>
              </n-breadcrumb-item>
            </n-breadcrumb>
            <n-flex align="center" :size="12">
              <n-tag type="primary" :bordered="false">
                第 {{ question.题号 }} 题
              </n-tag>
              <n-text depth="3" style="font-size: 13px;">{{ question.题源 }}</n-text>
              <n-tag v-if="question.是否选做 === '是'" type="warning" size="small" :bordered="false">
                选做
              </n-tag>
            </n-flex>
          </n-flex>
          <n-flex :size="8">
            <n-button 
              :type="question.user_state.is_favorite ? 'primary' : 'default'"
              :secondary="question.user_state.is_favorite"
              size="medium"
              round
              :loading="loadingFavorite"
              @click="toggleFavorite"
            >
              <template #icon>
                <n-icon>
                  <component :is="question.user_state.is_favorite ? Heart24Filled : Heart24Regular" />
                </n-icon>
              </template>
              收藏
            </n-button>
            <n-button 
              :type="question.user_state.is_wrong_book ? 'error' : 'default'"
              :secondary="question.user_state.is_wrong_book"
              size="medium"
              round
              :loading="loadingWrongBook"
              @click="toggleWrongBook"
            >
              <template #icon>
                <n-icon>
                  <component :is="question.user_state.is_wrong_book ? BookmarkMultiple24Filled : BookmarkMultiple24Regular" />
                </n-icon>
              </template>
              错题
            </n-button>
            <n-button 
              :type="question.user_state.is_mastered ? 'success' : 'default'"
              :secondary="question.user_state.is_mastered"
              size="medium"
              round
              :loading="loadingMastered"
              @click="toggleMastered"
            >
              <template #icon>
                <n-icon>
                  <Checkmark24Regular />
                </n-icon>
              </template>
              拿下
            </n-button>
          </n-flex>
        </n-flex>
      </template>

      <n-divider style="margin: 0;" />

      <QuestionContent :question="question" :is-mobile="isMobile" />

      <n-divider style="margin: 0;" />

      <template v-if="isMobile">
        <n-space vertical :size="12">
          <n-flex justify="space-between" align="center" :wrap="false">
            <n-flex :size="8">
              <n-button size="medium" secondary @click="toggleAnswer">
                {{ showAnswer ? '隐藏答案' : '答案' }}
              </n-button>
              <n-button size="medium" secondary @click="toggleAnalysis">
                {{ showAnalysis ? '隐藏解析' : '解析' }}
              </n-button>
            </n-flex>
            <n-flex :size="8">
              <n-button 
                :type="question.user_state.is_favorite ? 'primary' : 'default'"
                :secondary="question.user_state.is_favorite"
                size="medium"
                circle
                :loading="loadingFavorite"
                @click="toggleFavorite"
              >
                <template #icon>
                  <n-icon>
                    <component :is="question.user_state.is_favorite ? Heart24Filled : Heart24Regular" />
                  </n-icon>
                </template>
              </n-button>
              <n-button 
                :type="question.user_state.is_wrong_book ? 'error' : 'default'"
                :secondary="question.user_state.is_wrong_book"
                size="medium"
                circle
                :loading="loadingWrongBook"
                @click="toggleWrongBook"
              >
                <template #icon>
                  <n-icon>
                    <component :is="question.user_state.is_wrong_book ? BookmarkMultiple24Filled : BookmarkMultiple24Regular" />
                  </n-icon>
                </template>
              </n-button>
              <n-button 
                :type="question.user_state.is_mastered ? 'success' : 'default'"
                :secondary="question.user_state.is_mastered"
                size="medium"
                circle
                :loading="loadingMastered"
                @click="toggleMastered"
              >
                <template #icon>
                  <n-icon>
                    <Checkmark24Regular />
                  </n-icon>
                </template>
              </n-button>
            </n-flex>
          </n-flex>

          <n-flex :size="8">
            <n-button size="medium" secondary style="flex: 1;" @click="handleNote">
              <template #icon><n-icon><Note24Regular /></n-icon></template>
              笔记
            </n-button>
            <n-button 
              size="medium" 
              secondary 
              style="flex: 1;"
              :disabled="!question.video_url"
              @click="handleVideo"
            >
              <template #icon><n-icon><Video24Regular /></n-icon></template>
              Surd 无理视频
            </n-button>
          </n-flex>
        </n-space>
      </template>

      <template v-else>
        <n-flex :size="8" wrap>
          <n-button size="medium" secondary @click="toggleAnswer">
            {{ showAnswer ? '隐藏答案' : '查看答案' }}
          </n-button>
          <n-button size="medium" secondary @click="toggleAnalysis">
            {{ showAnalysis ? '隐藏解析' : '查看解析' }}
          </n-button>
          <n-button size="medium" secondary @click="handleNote">
            <template #icon>
              <n-icon><Note24Regular /></n-icon>
            </template>
            笔记
          </n-button>
          <n-button 
            size="medium"
            secondary 
            :disabled="!question.video_url"
            @click="handleVideo"
          >
            <template #icon>
              <n-icon><Video24Regular /></n-icon>
            </template>
            Surd 无理视频
          </n-button>
        </n-flex>
      </template>

      <template v-if="showAnswer">
        <n-alert v-if="question.答案" type="info" :bordered="false">
          <template #header>
            <n-flex align="center" :size="4">
              <n-icon size="18"><Checkmark24Regular /></n-icon>
              <span>正确答案</span>
            </n-flex>
          </template>
          <div style="font-size: 16px; font-weight: bold; color: var(--n-primary-color);">
            <LatexRender :content="question.答案" />
          </div>
        </n-alert>
        <n-alert v-else type="warning" :bordered="false">
          暂无答案，请查看题目解析
        </n-alert>
      </template>

      <template v-if="showAnalysis">
        <n-alert v-if="question.解析" type="success" :bordered="false">
          <template #header>解析</template>
          <LatexRender :content="question.解析" />
        </n-alert>
        <n-alert v-else type="warning" :bordered="false">
          暂无解析
        </n-alert>
      </template>
    </n-space>

    <NoteModal
      v-model:show="showNoteModal"
      :initial-note="question.user_state.note || ''"
      :loading="savingNote"
      @save="handleSaveNote"
    />

  </n-card>
</template>
