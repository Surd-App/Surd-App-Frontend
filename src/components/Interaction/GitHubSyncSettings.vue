<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { LogoGithub } from '@vicons/ionicons5'
import SettingCard from './SettingCard.vue'
import { useSettingsStore } from '../../store/settings'
import { useGitHubSyncStore } from '../../store/githubSync'
import { initializeGitHubSync, inspectGitHubSyncRepository, testGitHubToken, type InitialSyncMode, type MergePreference } from '../../utils/githubSync'

const settings = useSettingsStore()
const githubSync = useGitHubSyncStore()
const message = useMessage()
const setupVisible = ref(settings.githubSync.enabled)
const confirmStep = ref<0 | 1 | 2>(0)
const countdown = ref(3)
const token = ref('')
const testing = ref(false)
const saving = ref(false)
const syncChoiceVisible = ref(false)
const syncChoiceStep = ref<1 | 2>(1)
const syncMode = ref<InitialSyncMode | null>(null)
const mergePreference = ref<MergePreference>('local')
const syncRemoteExists = ref(false)
const testedToken = ref('')
const testedAccount = ref('')
const testedRepository = ref('')
let timer: number | undefined

const tested = computed(() => !!token.value && testedToken.value === token.value && !!testedAccount.value && !!testedRepository.value)
const confirmTitle = computed(() => confirmStep.value === 1 ? '确认启用 GitHub 云同步' : '准备 GitHub 仓库与 Token')

function startCountdown(seconds = 3) {
  if (timer !== undefined) window.clearInterval(timer)
  countdown.value = seconds
  timer = window.setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0 && timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
  }, 1000)
}

function requestEnable() {
  confirmStep.value = 1
  startCountdown()
}

function closeConfirmation() {
  confirmStep.value = 0
  if (timer !== undefined) window.clearInterval(timer)
  timer = undefined
}

function confirmCurrentStep() {
  if (countdown.value > 0) return
  if (confirmStep.value === 1) {
    confirmStep.value = 2
    startCountdown()
    return
  }
  setupVisible.value = true
  closeConfirmation()
}

async function toggleEnabled(value: boolean) {
  if (value) {
    requestEnable()
    return
  }
  setupVisible.value = false
  token.value = ''
  testedToken.value = ''
  testedAccount.value = ''
  testedRepository.value = ''
  if (!settings.githubSync.enabled) return
  try {
    await settings.turnOffGitHubSync()
    githubSync.deactivate()
    message.success('GitHub 云同步已关闭')
  } catch (error) {
    setupVisible.value = true
    message.error(error instanceof Error ? error.message : '云同步设置保存失败')
  }
}

async function testToken() {
  const value = token.value.trim()
  if (!value) {
    message.warning('请输入 GitHub Access Token')
    return
  }
  testing.value = true
  testedToken.value = ''
  testedAccount.value = ''
  testedRepository.value = ''
  try {
    const result = await testGitHubToken(value)
    testedToken.value = value
    testedAccount.value = result.account
    testedRepository.value = result.repository
    message.success(`测试通过：${result.repository}`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Token 可用性测试失败')
  } finally {
    testing.value = false
  }
}

async function save() {
  if (!tested.value || saving.value) return
  saving.value = true
  try {
    const inspection = await inspectGitHubSyncRepository(testedToken.value, testedRepository.value)
    syncRemoteExists.value = inspection.remoteExists
    syncMode.value = inspection.remoteExists ? null : 'local'
    syncChoiceStep.value = 1
    syncChoiceVisible.value = true
    startCountdown(5)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '读取云端同步状态失败')
  } finally {
    saving.value = false
  }
}

async function confirmSyncChoice() {
  if (countdown.value > 0 || !syncMode.value || saving.value) return
  if (syncMode.value === 'merge' && syncChoiceStep.value === 1) {
    syncChoiceStep.value = 2
    startCountdown(5)
    return
  }
  saving.value = true
  try {
    const result = await initializeGitHubSync(
      testedToken.value,
      testedAccount.value,
      testedRepository.value,
      syncMode.value,
      mergePreference.value,
    )
    settings.githubSync = result.settings
    githubSync.activate(result.lastSyncedAt)
    syncChoiceVisible.value = false
    token.value = ''
    testedToken.value = ''
    testedAccount.value = ''
    testedRepository.value = ''
    message.success('GitHub 云同步设置已加密保存')
    if (result.dataApplied && syncMode.value === 'cloud') {
      const base = import.meta.env.BASE_URL.replace(/\/$/, '')
      window.location.replace(`${base}/`)
    } else if (result.dataApplied) {
      window.location.reload()
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'GitHub 云同步设置保存失败')
  } finally {
    saving.value = false
  }
}

function cancelSyncChoice() {
  syncChoiceVisible.value = false
  syncMode.value = null
  closeConfirmation()
}

watch(token, () => {
  if (token.value === testedToken.value) return
  testedAccount.value = ''
  testedRepository.value = ''
})

onBeforeUnmount(() => {
  if (timer !== undefined) window.clearInterval(timer)
})
</script>

<template>
  <n-list class="settings-list" :bordered="false" show-divider>
    <SettingCard
      title="GitHub 云同步"
      description="将本地数据同步到仅由你控制的 GitHub 仓库"
      :icon="LogoGithub"
    >
      <template #actions>
        <n-switch
          :value="setupVisible"
          :disabled="testing || saving"
          aria-label="GitHub 云同步"
          @update:value="toggleEnabled"
        />
      </template>

      <div v-if="setupVisible" class="github-configuration">
        <n-alert v-if="settings.githubSync.enabled && settings.githubSync.hasToken" type="success" :show-icon="true">
          已连接 {{ settings.githubSync.repository }}。输入新 Token 可重新验证并替换现有凭据。
        </n-alert>
        <n-form-item label="GitHub Access Token" :show-feedback="false">
          <n-input
            v-model:value="token"
            type="password"
            show-password-on="click"
            placeholder="github_pat_..."
            autocomplete="off"
            :disabled="testing || saving"
          />
        </n-form-item>
        <n-flex justify="end" :size="8">
          <n-button :loading="testing" :disabled="saving || !token.trim()" @click="testToken">
            测试可用性
          </n-button>
          <n-button type="primary" :loading="saving" :disabled="!tested || testing" @click="save">
            保存
          </n-button>
        </n-flex>
      </div>
    </SettingCard>
  </n-list>

  <n-modal
    :show="confirmStep > 0"
    preset="card"
    :title="confirmTitle"
    style="width: min(520px, calc(100vw - 32px));"
    :mask-closable="false"
    :close-on-esc="false"
    @close="closeConfirmation"
  >
    <n-space vertical :size="16">
      <template v-if="confirmStep === 1">
        <n-alert type="warning" title="请先了解凭据风险">
          Access Token 相当于仓库访问凭据。请仅授予 Surd-App-Sync 仓库的 Contents 读写权限，不要授予账户级或其他仓库权限。
        </n-alert>
        <n-alert type="info" title="Token 的本地存储方式">
          Token 将通过 AES-GCM 加密后保存在当前浏览器的 IndexedDB 中，并从数据备份中排除。
        </n-alert>
        <n-alert type="error" title="千万不要将 Token 泄露给他人">
          获得 Token 的人可以在授权范围内读取、修改或删除仓库中的同步数据，造成隐私泄露或数据丢失。若怀疑 Token 已泄露，请立即前往 GitHub 撤销该 Token。
        </n-alert>
      </template>
      <template v-else>
        <n-text>
          请先在 GitHub 手动创建名为 <n-text code>Surd-App-Sync</n-text> 的私有仓库，创建时勾选初始化 README，再生成仅能访问该仓库的 Fine-grained Access Token。
        </n-text>
        <n-alert type="info" title="需要授予的仓库权限">
          请授权 <n-text code>Contents: Read and write</n-text> 和 <n-text code>Metadata: Read-only</n-text>。Contents 必须手动改为 Read and write，不能使用 Read-only，否则无法写入同步数据。
        </n-alert>
        <n-button
          tag="a"
          href="https://github.com/settings/personal-access-tokens"
          target="_blank"
          rel="noopener noreferrer"
          secondary
        >
          打开 GitHub Token 设置
        </n-button>
      </template>
    </n-space>
    <template #footer>
      <n-flex justify="end" :size="8">
        <n-button @click="closeConfirmation">取消</n-button>
        <n-button type="primary" :disabled="countdown > 0" @click="confirmCurrentStep">
          {{ countdown > 0 ? `请等待 ${countdown} 秒` : (confirmStep === 1 ? '继续' : '我已准备好') }}
        </n-button>
      </n-flex>
    </template>
  </n-modal>

  <n-modal
    :show="syncChoiceVisible"
    preset="card"
    title="选择首次同步方式"
    style="width: min(560px, calc(100vw - 32px));"
    :mask-closable="false"
    :close-on-esc="false"
    @close="cancelSyncChoice"
  >
    <n-space vertical :size="16">
      <n-alert v-if="!syncRemoteExists" type="info">
        云端还没有同步文件，将使用本地数据创建首次同步。
      </n-alert>
      <template v-else-if="syncChoiceStep === 1">
        <n-alert type="warning">
          本地和云端都可能包含数据，请选择首次同步的处理方式。覆盖操作只影响本应用支持同步的用户数据，不会修改题库。
        </n-alert>
        <n-radio-group v-model:value="syncMode" name="initial-sync-mode">
          <n-space vertical>
            <n-radio value="cloud">云端覆盖本地</n-radio>
            <n-radio value="local">本地覆盖云端</n-radio>
            <n-radio value="merge">合并本地和云端数据</n-radio>
          </n-space>
        </n-radio-group>
      </template>
      <template v-else>
        <n-alert type="info">合并时遇到同一字段同时修改，选择哪一侧优先。</n-alert>
        <n-radio-group v-model:value="mergePreference" name="merge-preference">
          <n-space vertical>
            <n-radio value="local">本地数据优先</n-radio>
            <n-radio value="cloud">云端数据优先</n-radio>
          </n-space>
        </n-radio-group>
      </template>
    </n-space>
    <template #footer>
      <n-flex justify="end" :size="8">
        <n-button @click="cancelSyncChoice">取消</n-button>
        <n-button
          type="primary"
          :disabled="countdown > 0 || !syncMode"
          :loading="saving"
          @click="confirmSyncChoice"
        >
          {{ countdown > 0 ? `请等待 ${countdown} 秒` : (syncChoiceStep === 1 && syncMode === 'merge' ? '继续' : '确认并同步') }}
        </n-button>
      </n-flex>
    </template>
  </n-modal>
</template>

<style scoped>
.settings-list { background-color: transparent; }
.settings-list :deep(.setting-item:first-child) { padding-top: 8px; }
.github-configuration {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--n-border-color);
}
.github-configuration .n-form-item { margin-bottom: 0; }
</style>
