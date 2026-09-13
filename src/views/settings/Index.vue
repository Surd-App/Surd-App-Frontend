<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import type { UploadFileInfo } from 'naive-ui'
import { useSettingsStore } from '../../store/settings'
import { useThemeStore } from '../../store/theme'
import { Image24Regular, DarkTheme24Regular } from '@vicons/fluent'
import SettingCard from '../../components/Interaction/SettingCard.vue'
import DataManagement from '../../components/Interaction/DataManagement.vue'

const settings = useSettingsStore()
const theme = useThemeStore()
const message = useMessage()
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
  <n-tabs type="line" default-value="personalization" class="settings-tabs">
    <n-tab-pane name="personalization" tab="个性化">
      <n-alert v-if="loadError" type="error" :title="loadError">
        <n-button size="small" @click="initialize">重试</n-button>
      </n-alert>
      <n-skeleton v-else-if="!settings.ready" text :repeat="3" />
      <n-space v-else vertical :size="16">
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
            <n-upload v-if="settings.personalization.background.type === 'image'" class="background-upload" accept="image/*" :show-file-list="false" :default-upload="false" :disabled="settings.saving || validating" @before-upload="selectImage">
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
      </n-space>
    </n-tab-pane>
    <n-tab-pane name="data" tab="数据管理">
      <DataManagement />
    </n-tab-pane>
  </n-tabs>
</template>

<style scoped>
.settings-tabs { text-align: left; }
.background-options { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--n-border-color); }
.background-upload { width: auto; }
.background-preview { order: -1; width: min(100%, 280px); aspect-ratio: 16 / 9; border-radius: var(--n-border-radius); overflow: hidden; }
.background-preview :deep(.n-image) { width: 100%; height: 100%; }
.background-preview :deep(img) { display: block; width: 100%; height: 100%; object-fit: cover; }
</style>

