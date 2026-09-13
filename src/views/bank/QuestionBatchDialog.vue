<script setup lang="ts">
import { computed, ref } from 'vue'
import { batchBankQuestions, type LocalBank, type QuestionBatchRequest } from '../../utils/questionBank'

const props = defineProps<{ bank: LocalBank; request: QuestionBatchRequest }>()
const emit = defineEmits<{ close: []; saved: [bank: LocalBank] }>()
const targetCategoryId = ref<number | null>(null)
const saving = ref(false)
const error = ref('')
const title = computed(() => ({ delete: '批量删除题目', move: '移动到其他章节', copy: '复制到其他章节' })[props.request.action])
const options = computed(() => {
  const categories = new Map(props.bank.categories.map(category => [category.id, category]))
  return props.bank.categories.map(category => {
    const names = [category.name]
    const visited = new Set([category.id])
    let parentId = category.parentId
    while (parentId !== null && !visited.has(parentId)) {
      visited.add(parentId)
      const parent = categories.get(parentId)
      if (!parent) break
      names.unshift(parent.name)
      parentId = parent.parentId
    }
    return { label: names.join(' / '), value: category.id, disabled: category.id === props.request.sourceCategoryId }
  })
})

async function save() {
  if (saving.value) return
  if (props.request.action !== 'delete' && targetCategoryId.value === null) {
    error.value = '请选择目标章节'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const bank = await batchBankQuestions(props.request, targetCategoryId.value ?? undefined)
    emit('saved', bank)
    emit('close')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '批量操作失败'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <n-modal
    :show="true"
    preset="card"
    :title="title"
    style="width: min(560px, calc(100vw - 32px));"
    :closable="!saving"
    :mask-closable="!saving"
    :close-on-esc="!saving"
    @update:show="value => { if (!value && !saving) emit('close') }"
  >
    <n-space vertical :size="16">
      <n-text>已选择 {{ request.questionIds.length }} 道题目。</n-text>
      <n-alert v-if="request.action === 'delete'" type="warning">
        将从整个题库删除这些题目，并移除它们在所有章节中的关联。此操作无法撤销。
      </n-alert>
      <template v-else>
        <n-select
          v-model:value="targetCategoryId"
          :options="options"
          :disabled="saving"
          filterable
          clearable
          placeholder="搜索并选择目标章节"
          aria-label="目标章节"
        />
        <n-text depth="3">
          {{ request.action === 'copy'
            ? '复制为独立题目，后续编辑互不影响；副本不继承原题的学习记录。'
            : '从当前章节移出并添加到目标章节，其他章节中的关联保留。' }}
        </n-text>
      </template>
      <n-alert v-if="error" type="error">{{ error }}</n-alert>
      <n-flex justify="end">
        <n-button :disabled="saving" @click="emit('close')">取消</n-button>
        <n-button :type="request.action === 'delete' ? 'error' : 'primary'" :loading="saving" @click="save">
          {{ request.action === 'delete' ? '确认删除' : '确认' }}
        </n-button>
      </n-flex>
    </n-space>
  </n-modal>
</template>
