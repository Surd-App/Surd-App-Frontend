<script setup lang="ts">
import { ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useCategoryStore } from '../../store/category'
import { useMobile } from '../../utils/responsive'
import { BankAlreadyExistsError, type BankImportConflictStrategy } from '../../utils/questionBank'

const categoryStore = useCategoryStore()
const { isMobile } = useMobile()
const message = useMessage()
const serverUrl = ref('')
const bankName = ref('')
const error = ref('')
const overwritePending = ref(false)
const existingBankId = ref('')
watch(() => categoryStore.showSync, show => {
  if (show) {
    serverUrl.value = categoryStore.sourceUrl || 'http://localhost:5000'
    bankName.value = categoryStore.bankName
    error.value = ''
    overwritePending.value = false
    existingBankId.value = ''
  }
})
async function startSync() {
  if (categoryStore.loading) return
  await sync()
}

async function sync(conflictStrategy?: BankImportConflictStrategy) {
  error.value = ''
  try {
    await categoryStore.fetchAndSync(serverUrl.value, bankName.value, conflictStrategy)
    overwritePending.value = false
    message.success(`在线题库导入完成，共 ${categoryStore.meta?.totalQuestions ?? 0} 道题目`)
    categoryStore.showSync = false
  } catch (reason) {
    if (reason instanceof BankAlreadyExistsError) {
      existingBankId.value = reason.bankId
      overwritePending.value = true
      return
    }
    error.value = reason instanceof Error ? reason.message : '导入失败，请检查服务器地址和网络'
  }
}
</script>

<template>
  <n-modal :show="categoryStore.showSync" :mask-closable="!categoryStore.loading"
    :close-on-esc="!categoryStore.loading" @update:show="categoryStore.showSync = $event">
    <n-card title="导入在线题库" :style="{ width: isMobile ? '90vw' : '460px' }"
      :bordered="false" role="dialog" aria-modal="true">
      <n-space vertical :size="16">
        <n-text depth="3">输入题库服务器地址，下载后即可在本地练习。</n-text>
        <n-input v-model:value="bankName" placeholder="请输入题库名称" aria-label="题库名称"
          :maxlength="80" :disabled="categoryStore.loading" />
        <n-input v-model:value="serverUrl" placeholder="http://localhost:5000"
          aria-label="题库服务器地址"
          :disabled="categoryStore.loading" @keyup.enter="!categoryStore.loading && sync()" />
        <n-alert v-if="error" type="error">{{ error }}</n-alert>
        <template v-if="categoryStore.loading">
          <n-text depth="3">{{ categoryStore.syncStatus }}</n-text>
          <n-progress type="line" :percentage="categoryStore.syncProgress" processing />
        </template>
        <n-flex justify="end">
          <n-button :disabled="categoryStore.loading" @click="categoryStore.showSync = false">取消</n-button>
          <n-button type="primary" :loading="categoryStore.loading" :disabled="categoryStore.loading || !serverUrl.trim() || !bankName.trim()"
            @click="startSync">开始导入</n-button>
        </n-flex>
      </n-space>
    </n-card>
  </n-modal>
  <n-modal
    v-model:show="overwritePending"
    preset="card"
    title="当前导入题库已经存在"
    style="width: min(500px, calc(100vw - 32px))"
    :closable="!categoryStore.loading"
    :mask-closable="!categoryStore.loading"
    :close-on-esc="!categoryStore.loading"
  >
    <n-space vertical :size="16">
      <n-alert type="warning">
        ID 为 <n-text code>{{ existingBankId }}</n-text> 的题库已存在。覆盖会替换现有题库内容并保留该题库的个人题目状态；创建新题库会使用当前时间戳作为新 ID，个人题目状态相互独立。
      </n-alert>
      <n-alert v-if="error" type="error">{{ error }}</n-alert>
    </n-space>
    <template #footer>
      <n-flex justify="end" :size="8">
        <n-button :disabled="categoryStore.loading" @click="overwritePending = false">取消</n-button>
        <n-button :loading="categoryStore.loading" :disabled="categoryStore.loading" @click="sync('create')">
          创建新题库
        </n-button>
        <n-button type="primary" :loading="categoryStore.loading" :disabled="categoryStore.loading" @click="sync('overwrite')">
          覆盖现有题库
        </n-button>
      </n-flex>
    </template>
  </n-modal>
</template>
