<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { useMessage } from 'naive-ui'
import ArrowDownload24Regular from '@vicons/fluent/es/ArrowDownload24Regular'
import ArrowUpload24Regular from '@vicons/fluent/es/ArrowUpload24Regular'
import Delete24Regular from '@vicons/fluent/es/Delete24Regular'
import SettingCard from './SettingCard.vue'
import type { UploadFileInfo } from 'naive-ui'
import { exportBackup, parseBackup, restoreBackup } from '../../utils/backup'
import type { LocalBackup } from '../../utils/backup'
import { deleteAllIndexedDBData } from '../../utils/database'

const message = useMessage()
const exporting = ref(false)
const reading = ref(false)
const importing = ref(false)
const pending = shallowRef<LocalBackup | null>(null)
const showConfirm = ref(false)
const clearConfirmStep = ref<0 | 1 | 2>(0)
const clearing = ref(false)
const busy = computed(() => exporting.value || reading.value || importing.value || clearing.value)
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

function requestClear() {
  clearConfirmStep.value = 1
}

async function confirmClear() {
  if (clearConfirmStep.value === 1) {
    clearConfirmStep.value = 2
    return
  }
  if (clearConfirmStep.value !== 2 || clearing.value) return
  clearing.value = true
  try {
    await deleteAllIndexedDBData()
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    window.location.replace(`${base}/`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '本地数据删除失败')
    clearing.value = false
  }
}
</script>

<template>
  <n-list class="settings-list" :bordered="false" show-divider>
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
    <SettingCard title="清空所有数据" description="永久删除当前浏览器中的全部题库、个人题目状态、设置和云同步凭据。" :icon="Delete24Regular">
      <template #actions>
        <n-button type="error" secondary :disabled="busy" @click="requestClear">清空所有数据</n-button>
      </template>
    </SettingCard>
  </n-list>
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
  <n-modal
    :show="clearConfirmStep > 0"
    preset="card"
    :title="clearConfirmStep === 1 ? '确认清空所有数据' : '再次确认永久删除'"
    style="width: min(500px, calc(100vw - 32px))"
    :closable="!clearing"
    :mask-closable="!clearing"
    :close-on-esc="!clearing"
    @update:show="!$event && !clearing && (clearConfirmStep = 0)"
  >
    <n-space vertical :size="16">
      <n-alert v-if="clearConfirmStep === 1" type="warning" title="此操作会删除当前浏览器中的全部应用数据">
        包括所有题库、个人题目状态、练习进度、背景设置、GitHub Token 和云同步配置。删除后无法撤销。
      </n-alert>
      <n-alert v-else type="error" title="这是最后一次确认">
        全部 IndexedDB 数据将被永久删除。请确认已经导出需要保留的数据；删除完成后应用会返回首页并重新初始化。
      </n-alert>
    </n-space>
    <template #footer>
      <n-flex justify="end" :size="8">
        <n-button :disabled="clearing" @click="clearConfirmStep = 0">取消</n-button>
        <n-button type="error" :loading="clearing" :disabled="clearing" @click="confirmClear">
          {{ clearConfirmStep === 1 ? '继续' : '永久删除全部数据' }}
        </n-button>
      </n-flex>
    </template>
  </n-modal>
</template>

<style scoped>
.settings-list { background-color: transparent; }
.settings-list :deep(.setting-item:first-child) { padding-top: 8px; }
.backup-upload { width: auto; }
</style>
