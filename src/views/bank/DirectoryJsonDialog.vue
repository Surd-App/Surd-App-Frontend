<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useMessage, type TreeOption } from 'naive-ui'
import { directoryPrompt, directorySignature, mergeDirectory, parseDirectoryJson } from '../../utils/categoryJson'
import { importBankDirectory, type LocalBank } from '../../utils/questionBank'

const props = defineProps<{ bank: LocalBank }>()
const emit = defineEmits<{ close: []; saved: [bank: LocalBank] }>()
const message = useMessage()
const input = ref('')
const error = ref('')
const saving = ref(false)
const showPreview = ref(false)
const preview = shallowRef<ReturnType<typeof mergeDirectory> | null>(null)
const signature = ref('')
const expandedKeys = ref<Array<string | number>>([])

watch(input, () => { preview.value = null; showPreview.value = false; error.value = '' })
watch(() => props.bank, () => {
  preview.value = null
  showPreview.value = false
  error.value = '题库已更新，请重新解析预览'
})

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(directoryPrompt)
    message.success('AI 提示词已复制')
  } catch {
    message.warning('复制失败，请选中提示词手动复制')
  }
}

function parsePreview() {
  error.value = ''
  preview.value = null
  try {
    const nodes = parseDirectoryJson(input.value)
    preview.value = mergeDirectory(props.bank, nodes)
    signature.value = directorySignature(props.bank)
    // Expand ancestors of every new entry so its location is visible in the preview.
    const categories = new Map(preview.value.bank.categories.map(category => [category.id, category]))
    const expanded = new Set<number>()
    for (const id of preview.value.addedIds) {
      let parentId = categories.get(id)?.parentId ?? null
      while (parentId !== null && !expanded.has(parentId)) {
        expanded.add(parentId)
        parentId = categories.get(parentId)?.parentId ?? null
      }
    }
    expandedKeys.value = [...expanded]
    showPreview.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '目录解析失败'
  }
}

const previewTree = computed<TreeOption[]>(() => {
  if (!preview.value) return []
  const { bank, addedIds } = preview.value
  const nodes = new Map<number, TreeOption>(bank.categories.map(category => [category.id, {
    key: category.id,
    label: `${category.name}${addedIds.has(category.id) ? '（新增）' : ''}`,
  }]))
  const ordered = [...bank.categories].sort((a, b) => a.sortOrder - b.sortOrder)
  for (const category of ordered) {
    if (category.parentId === null) continue
    const parent = nodes.get(category.parentId)
    if (parent) {
      parent.children ??= []
      parent.children.push(nodes.get(category.id)!)
    }
  }
  return bank.manifest.questionBank.rootCategoryIds.map(id => nodes.get(id)!).filter(Boolean)
})

async function confirm() {
  if (saving.value || !preview.value) return
  saving.value = true
  error.value = ''
  try {
    const bank = await importBankDirectory(props.bank.manifest.questionBank.id, input.value, signature.value)
    emit('saved', bank)
    emit('close')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '目录保存失败'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <n-modal
    :show="true"
    preset="card"
    title="使用 JSON 创建目录"
    style="width: min(800px, calc(100vw - 32px)); max-height: calc(100dvh - 32px);"
    content-style="min-height: 0; display: flex; flex-direction: column; overflow: hidden;"
    :closable="!saving"
    :mask-closable="false"
    :close-on-esc="!saving && !showPreview"
    @update:show="value => { if (!value && !saving) emit('close') }"
  >
    <n-scrollbar content-style="padding-right: 12px;">
      <n-space vertical :size="16">
        <n-flex justify="space-between" align="center">
          <n-text strong>AI 提示词</n-text>
          <n-button size="small" @click="copyPrompt">复制提示词</n-button>
        </n-flex>
        <n-input :value="directoryPrompt" type="textarea" readonly :autosize="{ minRows: 5, maxRows: 7 }" aria-label="AI 提示词" />
        <n-text depth="3">将提示词与目录图片发送给 AI，再将返回的 JSON 粘贴到下方。同级同名目录合并，新目录追加，已有题目和目录保留。</n-text>
        <n-input
          v-model:value="input"
          type="textarea"
          :disabled="saving"
          :autosize="{ minRows: 6, maxRows: 10 }"
          placeholder='粘贴 JSON 数组或 Markdown 代码块，例如 [{"name":"第一章","children":[]}]'
          aria-label="目录 JSON 代码"
        />
        <n-flex justify="end">
          <n-button :disabled="saving || !input.trim()" @click="parsePreview">解析并预览合并目录</n-button>
        </n-flex>
        <n-alert v-if="error && !showPreview" type="error">{{ error }}</n-alert>
      </n-space>
    </n-scrollbar>
    <n-flex justify="end" style="flex-shrink: 0; margin-top: 16px;">
      <n-button :disabled="saving" @click="emit('close')">取消</n-button>
    </n-flex>
  </n-modal>

  <n-modal
    v-model:show="showPreview"
    preset="card"
    title="合并后的目录"
    style="width: min(720px, calc(100vw - 32px)); max-height: calc(100dvh - 32px);"
    content-style="min-height: 0; display: flex; flex-direction: column; gap: 16px; overflow: hidden;"
    :closable="!saving"
    :mask-closable="false"
    :close-on-esc="!saving"
  >
    <template v-if="preview">
      <n-text strong>新增 {{ preview.addedIds.size }} 项 · 合并后共 {{ preview.bank.categories.length }} 项</n-text>
      <n-scrollbar style="height: min(480px, 55dvh);" content-style="padding-right: 12px; text-align: left;">
        <n-tree v-model:expanded-keys="expandedKeys" :data="previewTree" block-line expand-on-click :selectable="false" />
      </n-scrollbar>
    </template>
    <n-alert v-if="error" type="error">{{ error }}</n-alert>
    <n-flex justify="end" style="flex-shrink: 0;">
      <n-button :disabled="saving" @click="showPreview = false">取消</n-button>
      <n-button type="primary" :loading="saving" :disabled="!preview || saving" @click="confirm">确认</n-button>
    </n-flex>
  </n-modal>
</template>
