<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import ColorWandOutline from '@vicons/ionicons5/es/ColorWandOutline'
import { useRoute, useRouter } from 'vue-router'
import { useMessage, useThemeVars } from 'naive-ui'
import { createBankQuestion, readBank, type LocalBank, type QuestionEdit } from '../../utils/questionBank'
import { useCategoryStore } from '../../store/category'
import LatexRender from '../../components/Latex/LatexRender.vue'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const theme = useThemeVars()
const categoryStore = useCategoryStore()
const bank = shallowRef<LocalBank | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const categoryId = ref<number | null>(null)
const pdfInput = ref<HTMLInputElement | null>(null)
const pdfUrl = ref('')
const pdfName = ref('')
const selectingRegion = ref(false)
const selectionOverlay = ref<HTMLElement | null>(null)
const selectionStart = ref<{ x: number; y: number } | null>(null)
const selectionEnd = ref<{ x: number; y: number } | null>(null)
const dragPointer = ref<number | null>(null)
const selectionRect = computed(() => {
  if (!selectionStart.value || !selectionEnd.value) return null
  const start = selectionStart.value
  const end = selectionEnd.value
  return { left: Math.min(start.x, end.x), top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }
})

function cancelRegion() {
  const overlay = selectionOverlay.value
  if (dragPointer.value !== null && overlay?.hasPointerCapture(dragPointer.value)) {
    overlay.releasePointerCapture(dragPointer.value)
  }
  dragPointer.value = null
  selectingRegion.value = false
  selectionStart.value = null
  selectionEnd.value = null
}

async function startRegion() {
  if (!pdfUrl.value || saving.value) return
  cancelRegion()
  selectingRegion.value = true
  await nextTick()
  selectionOverlay.value?.focus()
}

function regionPoint(event: PointerEvent) {
  const bounds = selectionOverlay.value!.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
    y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)),
  }
}

function beginRegion(event: PointerEvent) {
  if (event.button !== 0 || dragPointer.value !== null) return
  event.preventDefault()
  selectionOverlay.value?.focus()
  selectionStart.value = regionPoint(event)
  selectionEnd.value = selectionStart.value
  dragPointer.value = event.pointerId
  selectionOverlay.value?.setPointerCapture(event.pointerId)
}

function updateRegion(event: PointerEvent) {
  if (dragPointer.value === event.pointerId) selectionEnd.value = regionPoint(event)
}

function finishRegion(event: PointerEvent) {
  if (event.button !== 0 || dragPointer.value !== event.pointerId) return
  updateRegion(event)
  if (selectionOverlay.value?.hasPointerCapture(event.pointerId)) {
    selectionOverlay.value.releasePointerCapture(event.pointerId)
  }
  dragPointer.value = null
}

function confirmRegion() {
  const rect = selectionRect.value
  if (!rect || rect.width < 4 || rect.height < 4) {
    message.info('请先按住左键框选 PDF 内容')
    return
  }
  cancelRegion()
  message.info('框选已确认，OCR 识别暂未接入')
}

function handleRegionKey(event: KeyboardEvent) {
  if (selectingRegion.value && event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancelRegion()
  }
}
const sourceText = ref('')
const emptyDraft = (): QuestionEdit => ({ contentMarkdown: '', answerMarkdown: '', explanationMarkdown: '' })
const draft = ref(emptyDraft())
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
const categoryOptions = computed(() => {
  const categories = bank.value?.categories ?? []
  const byId = new Map(categories.map(category => [category.id, category]))
  return categories.map(category => {
    const names = [category.name]
    const visited = new Set([category.id])
    let parentId = category.parentId
    while (parentId !== null && !visited.has(parentId)) {
      visited.add(parentId)
      const parent = byId.get(parentId)
      if (!parent) break
      names.unshift(parent.name)
      parentId = parent.parentId
    }
    return { label: names.join(' / '), value: category.id }
  })
})

function choosePdf(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    message.error('请选择 PDF 文件')
    return
  }
  cancelRegion()
  if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
  pdfUrl.value = URL.createObjectURL(file)
  pdfName.value = file.name
  if (!sourceText.value) sourceText.value = file.name
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleRegionKey, true)
  cancelRegion()
  if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
})
onMounted(async () => {
  window.addEventListener('keydown', handleRegionKey, true)
  try {
    bank.value = await readBank()
    const requestedId = Number(route.query.categoryId)
    if (bank.value?.categories.some(category => category.id === requestedId)) categoryId.value = requestedId
    if (!bank.value) error.value = '请先创建或选择题库'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '题库读取失败'
  } finally {
    loading.value = false
  }
})

async function save() {
  if (!bank.value || saving.value) return
  if (categoryId.value === null) { error.value = '请选择录入章节'; return }
  saving.value = true
  error.value = ''
  try {
    const updated = await createBankQuestion(bank.value.manifest.questionBank.id, categoryId.value, {
      ...draft.value, sourceText: sourceText.value,
    })
    bank.value = updated
    draft.value = emptyDraft()
    activeField.value = 'contentMarkdown'
    message.success('题目已保存，可以继续录入下一题')
    try {
      await categoryStore.loadBank(updated)
    } catch {
      message.warning('题目已保存，导航统计刷新失败，请刷新页面')
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '题目录入失败'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="entry-page">
    <n-card title="PDF 预览" size="small" class="entry-card" content-class="entry-card-content" header-style="flex-shrink: 0; text-align: left;">
      <template #header-extra>
        <n-button size="small" @click="pdfInput?.click()">{{ pdfUrl ? '更换 PDF' : '选择 PDF' }}</n-button>
      </template>
      <input ref="pdfInput" type="file" accept="application/pdf,.pdf" hidden @change="choosePdf" />
      <div v-if="pdfUrl" class="pdf-stage">
        <iframe :src="pdfUrl" :title="`PDF 预览：${pdfName}`" class="pdf-viewer" :style="{ pointerEvents: selectingRegion ? 'none' : undefined }" />
        <div
          v-if="selectingRegion"
          ref="selectionOverlay"
          class="pdf-selection-overlay"
          tabindex="0"
          aria-label="PDF 框选区域，按住左键框选，右键确认，Esc 取消"
          @pointerdown="beginRegion"
          @pointermove="updateRegion"
          @pointerup="finishRegion"
          @pointercancel="cancelRegion"
          @contextmenu.prevent="confirmRegion"
        >
          <div class="selection-hint" :style="{ background: theme.popoverColor, color: theme.textColor2, borderRadius: theme.borderRadius }">
            左键拖动框选 · 右键确认 · Esc 取消
          </div>
          <div
            v-if="selectionRect"
            class="pdf-selection-rect"
            :style="{
              left: `${selectionRect.left}px`, top: `${selectionRect.top}px`,
              width: `${selectionRect.width}px`, height: `${selectionRect.height}px`,
              borderColor: theme.primaryColor,
              background: `color-mix(in srgb, ${theme.primaryColor} 18%, transparent)`,
            }"
          />
        </div>
      </div>
      <n-empty v-else class="pdf-empty" description="选择本地 PDF，边看边录入题目">
        <template #extra><n-button @click="pdfInput?.click()">选择 PDF</n-button></template>
      </n-empty>
    </n-card>

    <n-card title="题目信息" size="small" class="entry-card" content-class="entry-card-content" header-style="flex-shrink: 0; text-align: left;">
      <template #header-extra>
        <n-button size="small" quaternary :disabled="saving" @click="router.push({ name: 'bank-management' })">返回题库</n-button>
      </template>
      <n-spin :show="loading" class="entry-loading" content-style="height: 100%; min-height: 0;">
        <n-scrollbar content-style="padding-right: 12px;">
          <n-space vertical :size="16">
            <n-alert v-if="error" type="error">{{ error }}</n-alert>
            <n-text v-if="bank" depth="3">{{ bank.displayName || bank.manifest.questionBank.name }}</n-text>
            <n-form-item label="录入章节" :show-feedback="false">
              <n-select v-model:value="categoryId" :options="categoryOptions" filterable placeholder="请选择章节" :disabled="saving || !bank" />
            </n-form-item>
            <n-form-item label="题目来源" :show-feedback="false">
              <n-input v-model:value="sourceText" placeholder="例如：教材名称、页码" :disabled="saving" />
            </n-form-item>
            <n-radio-group v-model:value="activeField" size="small" :disabled="saving">
              <n-radio-button v-for="field in fields" :key="field.value" :value="field.value">{{ field.label }}</n-radio-button>
            </n-radio-group>
            <div class="entry-preview" :style="{ background: theme.codeColor, borderColor: theme.borderColor, borderRadius: theme.borderRadius }">
              <n-button
                class="ocr-button"
                quaternary
                circle
                size="small"
                title="框选 PDF 内容进行 OCR 识别"
                aria-label="框选 OCR 识别"
                :disabled="!pdfUrl || saving"
                :type="selectingRegion ? 'primary' : 'default'"
                @click="startRegion"
              >
                <template #icon><n-icon><ColorWandOutline /></n-icon></template>
              </n-button>
              <n-scrollbar content-style="padding: 12px 44px 12px 12px;" container-style="overflow-x: hidden;">
                <LatexRender :content="code" />
              </n-scrollbar>
            </div>
            <n-text strong>LaTeX 代码</n-text>
            <n-input
              v-model:value="code"
              type="textarea"
              :autosize="{ minRows: 8, maxRows: 16 }"
              :disabled="saving"
              :theme-overrides="{ color: theme.codeColor, colorFocus: theme.codeColor, borderRadius: theme.borderRadius }"
              placeholder="输入题目正文和 LaTeX 公式"
              aria-label="LaTeX 代码"
            />
          </n-space>
        </n-scrollbar>
      </n-spin>
      <n-flex justify="end" class="entry-actions">
        <n-button type="primary" :loading="saving" :disabled="loading || !bank || saving" @click="save">保存并继续录入</n-button>
      </n-flex>
    </n-card>
  </div>
</template>

<style scoped>
.entry-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 16px;
  height: calc(100dvh - 112px);
  min-width: 0;
  overflow: hidden;
  text-align: left;
}
.entry-card { min-width: 0; min-height: 0; height: 100%; overflow: hidden; }
.entry-page :deep(.entry-card-content) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.pdf-stage { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.pdf-viewer { display: block; width: 100%; height: 100%; border: 0; }
.pdf-selection-overlay { position: absolute; inset: 0; z-index: 2; cursor: crosshair; touch-action: none; user-select: none; outline: none; }
.pdf-selection-rect { position: absolute; box-sizing: border-box; border: 2px solid; pointer-events: none; }
.selection-hint { position: absolute; top: 8px; left: 8px; padding: 6px 10px; pointer-events: none; z-index: 1; }
.pdf-empty { flex: 1; justify-content: center; }
.entry-loading { flex: 1; min-height: 0; overflow: hidden; }
.entry-preview { position: relative; height: 200px; overflow: hidden; border: 1px solid; }
.ocr-button { position: absolute; top: 6px; right: 6px; z-index: 1; }
.entry-actions { flex-shrink: 0; margin-top: 16px; }
@media (width < 768px) {
  .entry-page {
    height: calc(100dvh - 96px);
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(180px, 40%) minmax(0, 1fr);
    gap: 12px;
  }
}
</style>
