<script setup lang="ts">
import { computed, ref } from 'vue'
import { useThemeVars } from 'naive-ui'
import LatexRender from '../../components/Latex/LatexRender.vue'
import { editBankQuestion, type BankQuestion, type LocalBank, type QuestionEdit } from '../../utils/questionBank'

const props = defineProps<{ bankId: string; question: BankQuestion }>()
const emit = defineEmits<{ close: []; saved: [bank: LocalBank] }>()
const themeVars = useThemeVars()
const editorSurfaceColor = computed(() => themeVars.value.codeColor)
const editorSurfaceStyle = computed(() => ({
  backgroundColor: editorSurfaceColor.value,
  borderColor: themeVars.value.borderColor,
  borderRadius: themeVars.value.borderRadius,
}))
const codeThemeOverrides = computed(() => ({
  color: editorSurfaceColor.value,
  colorFocus: editorSurfaceColor.value,
  border: `1px solid ${themeVars.value.borderColor}`,
  borderRadius: themeVars.value.borderRadius,
}))
const draft = ref<QuestionEdit>({
  contentMarkdown: props.question.contentMarkdown,
  answerMarkdown: props.question.answerMarkdown,
  explanationMarkdown: props.question.explanationMarkdown,
})
const activeField = ref<keyof QuestionEdit>('contentMarkdown')
const fields = [
  { label: '题干', value: 'contentMarkdown' },
  { label: '答案', value: 'answerMarkdown' },
  { label: '解析', value: 'explanationMarkdown' },
]
const code = computed({
  get: () => draft.value[activeField.value] ?? '',
  set: (value: string) => { draft.value[activeField.value] = value },
})
const saving = ref(false)
const error = ref('')

async function save() {
  if (saving.value) return
  error.value = ''
  saving.value = true
  try {
    const bank = await editBankQuestion(props.bankId, props.question.id, { ...draft.value })
    emit('saved', bank)
    emit('close')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '题目保存失败'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <n-modal
    :show="true"
    preset="card"
    title="编辑题目"
    style="width: min(960px, calc(100vw - 32px)); max-height: calc(100dvh - 32px);"
    content-style="display: flex; flex-direction: column; min-height: 0; overflow: hidden;"
    :closable="!saving"
    :mask-closable="false"
    :close-on-esc="!saving"
    @update:show="value => { if (!value && !saving) emit('close') }"
  >
    <div class="question-editor">
      <n-radio-group
        v-model:value="activeField"
        :disabled="saving"
        size="small"
        style="align-self: flex-start;"
      >
        <n-radio-button v-for="field in fields" :key="field.value" :value="field.value">
          {{ field.label }}
        </n-radio-button>
      </n-radio-group>
      <div
        class="question-preview"
        :style="editorSurfaceStyle"
      >
        <n-scrollbar
          content-style="padding: 12px; overflow-wrap: anywhere;"
          container-style="overflow-x: hidden;"
        >
          <LatexRender :content="code" />
        </n-scrollbar>
      </div>

      <n-text strong>LaTeX 代码</n-text>
      <n-input
        v-model:value="code"
        type="textarea"
        aria-label="LaTeX 代码"
        placeholder="输入正文和 LaTeX，行内公式使用 $...$，独立公式使用 $$...$$"
        :disabled="saving"
        :autosize="{ minRows: 5, maxRows: 9 }"
        :theme-overrides="codeThemeOverrides"
        class="latex-code"
      />
      <n-alert v-if="error" type="error">{{ error }}</n-alert>
      <n-flex justify="end">
        <n-button :disabled="saving" @click="emit('close')">取消</n-button>
        <n-button type="primary" :loading="saving" @click="save">保存</n-button>
      </n-flex>
    </div>
  </n-modal>
</template>

<style scoped>
.question-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  text-align: left;
}

.question-preview {
  height: clamp(120px, 28dvh, 300px);
  flex-shrink: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid;
}

.latex-code :deep(textarea) {
  font-family: Consolas, monospace;
}
</style>
