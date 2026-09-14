<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { useMessage } from 'naive-ui'
import { ArrowDownload24Regular, ArrowUpload24Regular } from '@vicons/fluent'
import SettingCard from './SettingCard.vue'
import type { UploadFileInfo } from 'naive-ui'
import { exportBackup, parseBackup, restoreBackup } from '../../utils/backup'
import type { LocalBackup } from '../../utils/backup'

const message = useMessage()
const exporting = ref(false)
const reading = ref(false)
const importing = ref(false)
const pending = shallowRef<LocalBackup | null>(null)
const showConfirm = ref(false)
const busy = computed(() => exporting.value || reading.value || importing.value)
const stateCount = computed(() => pending.value?.stores.states.reduce((sum, entry) => sum + Object.keys(entry.value).length, 0) ?? 0)

async function download() {
  exporting.value = true
  try {
    const backup = await exportBackup()
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `Surd无理备份-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10000)
    message.success('备份文件已生成')
  } catch (error) { message.error(error instanceof Error ? error.message : '导出失败') }
  finally { exporting.value = false }
}

async function selectBackup({ file }: { file: UploadFileInfo }) {
  if (!file.file || busy.value) return false
  reading.value = true
  try {
    pending.value = parseBackup(await file.file.text())
    showConfirm.value = true
  } catch { message.error('无法读取备份，请选择本应用导出的有效 JSON 备份文件') }
  finally { reading.value = false }
  return false
}

async function restore() {
  if (!pending.value || importing.value) return
  importing.value = true
  try {
    await restoreBackup(pending.value)
    window.location.reload()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '导入失败')
    importing.value = false
  }
}
</script>

<template>
  <n-space vertical :size="16">
    <SettingCard title="导出本地数据" description="备份全部学科的掌握状态与时间、收藏、错题、笔记，以及背景图片和主题设置，不包含题库。" :icon="ArrowDownload24Regular">
      <template #actions>
        <n-button :disabled="busy" :loading="exporting" @click="download">导出备份</n-button>
      </template>
    </SettingCard>
    <SettingCard title="导入本地数据" description="恢复个人记录和设置，保留当前题库。确认导入后自动刷新页面。" :icon="ArrowUpload24Regular">
      <template #actions>
        <n-upload accept=".json,application/json" :show-file-list="false" :default-upload="false" :disabled="busy" class="backup-upload" @before-upload="selectBackup">
          <n-button :disabled="busy" :loading="reading || importing">选择备份文件</n-button>
        </n-upload>
      </template>
    </SettingCard>
  </n-space>
  <n-modal v-model:show="showConfirm" preset="card" title="确认导入备份" style="width: min(480px, calc(100vw - 32px))" :closable="!importing" :mask-closable="!importing" :close-on-esc="!importing">
    <n-space v-if="pending" vertical :size="16">
      <n-text>备份时间：{{ new Date(pending.exportedAt).toLocaleString('zh-CN') }}</n-text>
      <n-text>{{ pending.stores.states.length }} 个学科 · {{ stateCount }} 条个人记录 · {{ pending.stores.settings.length }} 组设置</n-text>
      <n-alert type="warning">此操作将覆盖个人记录和设置，当前题库保持不变。建议先导出个人数据作为备份。</n-alert>
      <n-flex justify="end">
        <n-button :disabled="importing" @click="showConfirm = false; pending = null">取消</n-button>
        <n-button type="primary" :loading="importing" :disabled="importing" @click="restore">确认导入并刷新</n-button>
      </n-flex>
    </n-space>
  </n-modal>
</template>

<style scoped>
.backup-upload { width: auto; }
</style>
