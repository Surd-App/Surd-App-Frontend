<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { Add24Regular, Delete24Regular, Library24Regular } from '@vicons/fluent'
import { useCategoryStore } from '../../store/category'
import { useDialog } from 'naive-ui'
import { createLocalBank, deleteBank, listBanks, selectBank } from '../../utils/questionBank'
import type { SavedBank } from '../../utils/questionBank'

const categoryStore = useCategoryStore()
const dialog = useDialog()
const show = computed({ get: () => categoryStore.showBankSwitcher, set: value => { categoryStore.showBankSwitcher = value } })
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const banks = shallowRef<SavedBank[]>([])
const selected = ref<string | null>(null)
const current = ref<string | null>(null)
const creating = ref(false)
const newBankName = ref('')

function startCreate() {
  creating.value = true
  newBankName.value = ''
  error.value = ''
}

async function create() {
  if (saving.value || loading.value) return
  saving.value = true
  error.value = ''
  try {
    await createLocalBank(newBankName.value)
    window.location.reload()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '新建题库失败，请重试'
    saving.value = false
  }
}

async function open() {
  creating.value = false
  loading.value = true
  error.value = ''
  try {
    const result = await listBanks()
    banks.value = result.banks
    current.value = result.currentId
    selected.value = result.banks.some(bank => bank.id === result.currentId) ? result.currentId : null
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '题库列表加载失败' }
  finally { loading.value = false }
}
watch(show, value => { if (value) void open() }, { immediate: true })
async function save() {
  if (!selected.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await selectBank(selected.value)
    window.location.reload()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '切换失败，请重试'
    saving.value = false
  }
}
async function remove(bank: SavedBank) {
  if (bank.id === current.value || saving.value) return
  dialog.warning({
    title: '删除题库',
    content: `确定删除“${bank.name}”吗？删除后无法恢复。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      saving.value = true
      error.value = ''
      try {
        await deleteBank(bank.id)
        banks.value = banks.value.filter(item => item.id !== bank.id)
        if (selected.value === bank.id) selected.value = current.value
      } catch (reason) {
        error.value = reason instanceof Error ? reason.message : '删除失败，请重试'
      } finally { saving.value = false }
    },
  })
}
function importBank() {
  show.value = false
  categoryStore.showSync = true
}
</script>

<template>
  <n-button quaternary circle size="large" aria-label="切换题库" :title="categoryStore.bankName ? `切换题库：${categoryStore.bankName}` : '切换题库'" :disabled="categoryStore.loading" @click="show = true">
    <template #icon><n-icon><Library24Regular /></n-icon></template>
  </n-button>
  <n-modal v-model:show="show" preset="card" title="切换题库" style="width: min(520px, calc(100vw - 32px))" :closable="!saving" :mask-closable="!saving" :close-on-esc="!saving">
    <n-space vertical :size="16">
      <n-alert v-if="error" type="error">{{ error }}</n-alert>
      <n-alert v-if="!loading && current && !banks.some(bank => bank.id === current)" type="info">当前设置中的题库不在本机，请选择或导入题库。</n-alert>
      <n-space v-if="creating" vertical :size="12">
        <n-input
          v-model:value="newBankName"
          placeholder="请输入新题库名称"
          aria-label="新题库名称"
          :disabled="saving"
          @keydown.enter.prevent="create"
        />
        <n-text depth="3">创建不含题目的本地题库，附带一个可编辑的默认章节，创建后自动切换。</n-text>
        <n-flex justify="end">
          <n-button :disabled="saving" @click="creating = false; error = ''">返回列表</n-button>
          <n-button type="primary" :loading="saving" :disabled="!newBankName.trim() || saving" @click="create">
            创建并切换
          </n-button>
        </n-flex>
      </n-space>
      <n-spin v-else :show="loading">
        <n-scrollbar style="max-height: 360px">
          <n-radio-group v-model:value="selected" :disabled="saving || loading" class="bank-options" aria-label="已保存题库">
            <div v-for="bank in banks" :key="bank.id" class="bank-option" @click="!saving && !loading && (selected = bank.id)">
              <n-radio :value="bank.id" :aria-label="bank.name" />
              <div class="bank-info">
                <n-text strong>{{ bank.name }}</n-text>
                <n-text depth="3" style="font-size: 12px">{{ bank.questionCount }} 道题目 · {{ new Date(bank.syncTime).toLocaleDateString('zh-CN') }}</n-text>
              </div>
              <n-tag v-if="bank.id === current" type="primary" size="small">当前</n-tag>
              <n-button v-else quaternary circle size="small" type="error" aria-label="删除题库" title="删除题库" @click.stop="remove(bank)">
                <template #icon><n-icon><Delete24Regular /></n-icon></template>
              </n-button>
            </div>
          </n-radio-group>
          <n-empty v-if="!loading && !banks.length" description="暂无已保存题库" />
        </n-scrollbar>
      </n-spin>
      <n-flex v-if="!creating" justify="space-between">
        <n-flex>
          <n-button :disabled="saving || loading" @click="startCreate">
            <template #icon><n-icon><Add24Regular /></n-icon></template>
            新建题库
          </n-button>
          <n-button :disabled="saving || loading" @click="importBank">导入在线题库</n-button>
        </n-flex>
        <n-flex>
          <n-button :disabled="saving" @click="show = false">取消</n-button>
          <n-button type="primary" :loading="saving" :disabled="!selected || loading || saving" @click="save">保存并刷新</n-button>
        </n-flex>
      </n-flex>
    </n-space>
  </n-modal>
</template>

<style scoped>
.bank-options { display: flex; flex-direction: column; width: 100%; }
.bank-option { display: flex; align-items: center; gap: 12px; padding: 14px 0; cursor: pointer; text-align: left; }
.bank-option + .bank-option { border-top: 1px solid var(--n-border-color); }
.bank-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; overflow-wrap: anywhere; }
.bank-option :deep(.n-button) { flex-shrink: 0; }
</style>
