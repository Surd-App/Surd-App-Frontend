<script setup lang="ts">
import { ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useCategoryStore } from '../../store/category'
import { useMobile } from '../../utils/responsive'
import { listBanks } from '../../utils/questionBank'

const categoryStore = useCategoryStore()
const { isMobile } = useMobile()
const message = useMessage()
const serverUrl = ref('')
const bankName = ref('')
const error = ref('')
const overwritePending = ref(false)
watch(() => categoryStore.showSync, show => {
  if (show) {
    serverUrl.value = categoryStore.sourceUrl || 'http://localhost:5000'
    bankName.value = categoryStore.bankName
    error.value = ''
  }
})
async function startSync() {
  if (categoryStore.loading) return
  try {
    const { banks } = await listBanks()
    overwritePending.value = banks.some(bank => bank.name.trim() === bankName.value.trim())
    if (overwritePending.value) return
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '无法读取本地题库列表'
    return
  }
  await sync()
}

async function sync() {
  error.value = ''
  try {
    await categoryStore.fetchAndSync(serverUrl.value, bankName.value)
    message.success(`在线题库导入完成，共 ${categoryStore.meta?.totalQuestions ?? 0} 道题目`)
    categoryStore.showSync = false
  } catch (reason) {
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
  <n-modal v-model:show="overwritePending" preset="dialog" type="warning" title="题库名称已存在"
    content="使用相同名称导入会覆盖已有题库，是否继续？" positive-text="继续覆盖" negative-text="取消"
    :positive-button-props="{ loading: categoryStore.loading }"
    @positive-click="sync" />
</template>
