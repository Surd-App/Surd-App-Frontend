<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMessage, useThemeVars } from 'naive-ui'
import type { UploadFileInfo } from 'naive-ui'
import { useSettingsStore } from '../../store/settings'
import { useThemeStore } from '../../store/theme'
import { Image24Regular, DarkTheme24Regular } from '@vicons/fluent'
import SettingCard from '../../components/Interaction/SettingCard.vue'
import DataManagement from '../../components/Interaction/DataManagement.vue'
import GitHubSyncSettings from '../../components/Interaction/GitHubSyncSettings.vue'

const settings = useSettingsStore()
const theme = useThemeStore()
const message = useMessage()
const themeVars = useThemeVars()
const tabsThemeOverrides = computed(() => ({
  tabFontSizeLarge: themeVars.value.fontSizeHuge,
  tabFontWeightActive: themeVars.value.fontWeightStrong,
}))
const loadError = ref('')
const validating = ref(false)

async function initialize() {
  loadError.value = ''
  try { await settings.initialize() }
  catch (error) { loadError.value = error instanceof Error ? error.message : '设置加载失败' }
}
onMounted(initialize)

async function changeBackground(value: 'solid' | 'image' | 'bing') {
  try { await settings.setBackground(value) }
  catch (error) { message.error(error instanceof Error ? error.message : '背景设置保存失败') }
}

async function selectImage({ file }: { file: UploadFileInfo }) {
  const image = file.file
  if (!image || !image.type.startsWith('image/')) {
    message.error('请选择图片文件')
    return false
  }
  validating.value = true
  const url = URL.createObjectURL(image)
  try {
    const preview = new Image()
    preview.src = url
    await preview.decode()
    await settings.setBackground('image', image)
    message.success('图片背景已保存')
  } catch (error) {
    message.error(error instanceof DOMException && error.name === 'EncodingError'
      ? '无法读取这张图片，请选择其他图片'
      : error instanceof Error ? error.message : '图片保存失败')
  } finally {
    URL.revokeObjectURL(url)
    validating.value = false
  }
  return false
}
</script>

<template>
  <n-card class="settings-card" content-class="settings-card-content">
    <n-tabs
      type="line"
      size="large"
      default-value="personalization"
      class="settings-tabs"
      pane-style="padding: 0;"
      :theme-overrides="tabsThemeOverrides"
    >
      <n-tab-pane name="personalization" tab="个性化">
        <n-scrollbar class="settings-scrollbar">
          <div class="settings-pane-content">
            <n-alert v-if="loadError" type="error" :title="loadError">
              <n-button size="small" @click="initialize">重试</n-button>
            </n-alert>
            <n-skeleton v-else-if="!settings.ready" text :repeat="3" />
            <n-list v-else class="settings-list" :bordered="false" show-divider>
              <SettingCard title="背景设置" description="选择页面内容区域的背景样式" :icon="Image24Regular">
                <template #actions>
                  <n-radio-group
                    :value="settings.personalization.background.type"
                    :disabled="settings.saving || validating"
                    aria-label="背景设置"
                    @update:value="changeBackground"
                  >
                    <n-radio-button value="solid">纯色</n-radio-button>
                    <n-radio-button value="image">图片</n-radio-button>
                    <n-radio-button value="bing">Bing 每日壁纸</n-radio-button>
                  </n-radio-group>
                </template>
                <div v-if="settings.personalization.background.type === 'image'" class="background-options">
                  <n-upload class="background-upload" accept="image/*" :show-file-list="false" :default-upload="false" :disabled="settings.saving || validating" @before-upload="selectImage">
                    <n-button :loading="settings.saving || validating">{{ settings.imageUrl ? '更换图片' : '上传图片' }}</n-button>
                  </n-upload>
                  <n-flex v-if="settings.imageUrl" vertical :size="12" class="background-preview">
                    <n-image :src="settings.imageUrl" :alt="settings.personalization.background.imageName" width="100%" height="100%" object-fit="cover" />
                  </n-flex>
                </div>
              </SettingCard>
              <SettingCard title="界面主题" description="切换浅色或深色外观" :icon="DarkTheme24Regular">
                <template #actions>
                  <n-radio-group :value="theme.isDark ? 'dark' : 'light'" aria-label="界面主题" @update:value="theme.setTheme($event === 'dark')">
                    <n-radio-button value="light">浅色</n-radio-button>
                    <n-radio-button value="dark">深色</n-radio-button>
                  </n-radio-group>
                </template>
              </SettingCard>
            </n-list>
          </div>
        </n-scrollbar>
      </n-tab-pane>
      <n-tab-pane name="data" tab="数据管理">
        <n-scrollbar class="settings-scrollbar">
          <div class="settings-pane-content">
            <DataManagement />
          </div>
        </n-scrollbar>
      </n-tab-pane>
      <n-tab-pane name="cloud" tab="云同步">
        <n-scrollbar class="settings-scrollbar">
          <div class="settings-pane-content">
            <GitHubSyncSettings v-if="settings.ready" />
            <n-skeleton v-else text :repeat="3" />
          </div>
        </n-scrollbar>
      </n-tab-pane>
    </n-tabs>
  </n-card>
</template>

<style scoped>
.settings-card { height: 100%; overflow: hidden; }
.settings-card :deep(.settings-card-content) { box-sizing: border-box; height: 100%; min-height: 0; padding: 16px 20px 20px; overflow: hidden; }
.settings-tabs { height: 100%; min-height: 0; text-align: left; }
.settings-tabs :deep(.n-tabs-nav) { flex: 0 0 auto; }
.settings-tabs :deep(.n-tabs-pane-wrapper) { flex: 1; min-height: 0; }
.settings-tabs :deep(.n-tab-pane) { height: 100%; }
.settings-scrollbar { height: 100%; }
.settings-pane-content { box-sizing: border-box; padding-top: 8px; }
.settings-list { background-color: transparent; }
.settings-list :deep(.setting-item:first-child) { padding-top: 8px; }
.background-options { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--n-border-color); }
.background-upload { width: auto; }
.background-preview { order: -1; width: min(100%, 280px); aspect-ratio: 16 / 9; border-radius: var(--n-border-radius); overflow: hidden; }
.background-preview :deep(.n-image) { width: 100%; height: 100%; }
.background-preview :deep(img) { display: block; width: 100%; height: 100%; object-fit: cover; }
@media (width < 768px) {
  .settings-card :deep(.settings-card-content) { padding: 12px 16px 16px; }
  .settings-pane-content { padding-top: 6px; }
  .settings-list :deep(.setting-item:first-child) { padding-top: 6px; }
}
</style>

