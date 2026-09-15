<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import type { Component } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NIcon } from 'naive-ui'
import {
  Home24Regular,
  List24Regular,
  ClipboardError24Regular,
  Star24Regular,
  Book24Regular,
  CloudArrowDown24Regular,
  CloudArrowUp24Regular,
  Cloud24Regular,
  CloudSync24Regular,
  CloudDismiss24Regular,
  Navigation24Regular,
  Map24Regular,
  Settings24Regular,
  Library24Regular,
} from '@vicons/fluent'
import { Moon, Sunny } from '@vicons/ionicons5'
import { useThemeStore } from '../store/theme'
import { useSettingsStore } from '../store/settings'
import { useCategoryStore } from '../store/category'
import { useMobile } from '../utils/responsive'
import { useMessage } from 'naive-ui'
import SyncModal from '../components/Interaction/SyncModal.vue'
import BankSwitcher from '../components/Interaction/BankSwitcher.vue'
import { listBanks } from '../utils/questionBank'
import { useGitHubSyncStore } from '../store/githubSync'

const router = useRouter()
const route = useRoute()
const themeStore = useThemeStore()
const settingsStore = useSettingsStore()
const bingBackground = computed(() => settingsStore.personalization.background.type === 'bing'
  ? settingsStore.backgroundUrl : '')
const bingReady = ref(false)
watch(bingBackground, async (url, _previous, onCleanup) => {
  bingReady.value = false
  if (!url) return
  let cancelled = false
  const image = new Image()
  onCleanup(() => { cancelled = true })
  image.src = url
  try {
    await image.decode()
    if (!cancelled) bingReady.value = true
  } catch {
    // Keep the current theme background if the remote wallpaper is unavailable.
  }
}, { immediate: true })
const homeBackgroundStyle = computed(() => {
  const url = settingsStore.backgroundUrl
  if (!url) return {}
  const image = `url("${url}")`
  const background = themeStore.isDark
    ? `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), ${image}`
    : image
  return bingBackground.value
    ? { '--bing-background': background }
    : { backgroundImage: background, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
})
const categoryStore = useCategoryStore()
const { isMobile } = useMobile()
const message = useMessage()
const githubSyncStore = useGitHubSyncStore()
const syncIcon = computed(() => {
  if (githubSyncStore.status === 'uploading' || githubSyncStore.status === 'pending') return CloudArrowUp24Regular
  if (githubSyncStore.status === 'downloading') return CloudArrowDown24Regular
  if (githubSyncStore.status === 'error' || githubSyncStore.status === 'attention') return CloudDismiss24Regular
  return githubSyncStore.enabled ? CloudSync24Regular : Cloud24Regular
})
const syncIconColor = computed(() => {
  if (githubSyncStore.status === 'error') return 'var(--n-error-color)'
  if (githubSyncStore.status === 'attention') return 'var(--n-warning-color)'
  return undefined
})

const showMobileMenu = ref(false)
const collapsed = ref(false)

onMounted(async () => {
  void settingsStore.initialize().catch(error => message.error(error instanceof Error ? error.message : '背景设置加载失败'))
  void githubSyncStore.initialize()
  if (!localStorage.getItem('theme')) {
    const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    themeStore.setTheme(isSystemDark)
    message.info(`已跟随系统切换为${isSystemDark ? '深色' : '浅色'}模式`, { duration: 3000 })
  }

  try {
    await categoryStore.initialize()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '读取本地题库失败')
    categoryStore.showSync = true
    return
  }
  if (categoryStore.meta) {
    const date = new Date(categoryStore.meta.syncTime)
    const formattedDate = `${date.getFullYear()}年${(date.getMonth() + 1).toString().padStart(2, '0')}月${date.getDate().toString().padStart(2, '0')}日${date.getHours().toString().padStart(2, '0')}时${date.getMinutes().toString().padStart(2, '0')}分${date.getSeconds().toString().padStart(2, '0')}秒`
    message.success('成功加载本地 Surd 无理题库！')
    message.info(`上次导入时间：${formattedDate}`)
  } else {
    try {
      const { banks } = await listBanks()
      if (banks.length) categoryStore.showBankSwitcher = true
      else categoryStore.showSync = true
    } catch {
      categoryStore.showSync = true
    }
  }
})

const handleSyncCloud = () => {
  categoryStore.showSync = true
}

function renderIcon(icon: Component) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

const menuOptions = computed(() => [
  {
    label: '首页',
    key: 'home',
    icon: renderIcon(Home24Regular),
  },
  {
    label: '章节目录',
    key: 'category',
    icon: renderIcon(List24Regular),
    children: categoryStore.meta?.topLevelNames.map((name, index) => ({
      label: name,
      key: `category-${categoryStore.meta?.categoryIds[index]}`,
      icon: renderIcon(Book24Regular),
    })),
  },
  {
    label: '卡片地图',
    key: 'card-map',
    icon: renderIcon(Map24Regular),
  },
  {
    label: '错题本',
    key: 'mistakes',
    icon: renderIcon(ClipboardError24Regular),
  },
  {
    label: '收藏本',
    key: 'favorites',
    icon: renderIcon(Star24Regular),
  },
  {
    label: '题库管理',
    key: 'bank-management',
    icon: renderIcon(Library24Regular),
  },
  {
    label: '设置',
    key: 'settings',
    icon: renderIcon(Settings24Regular),
  },
])

const canvasChapterPath = computed(() =>
  categoryStore.findCategoryPath(Number(route.params.categoryId)),
)

const breadcrumbs = computed(() => {
  const items = [{ label: '首页', path: '/' }]

  if (route.name === 'question-canvas') {
    const id = Number(route.params.categoryId)
    const path = id ? categoryStore.findCategoryPath(id) : []
    items.push({ label: '卡片地图', path: '/card-map' })
    path.forEach((cat) => {
      items.push({ label: cat.name, path: '' })
    })
  } else if (route.name === 'category' || route.name === 'practice') {
    const id = Number(route.params.id || route.params.categoryId)
    if (id) {
      const path = categoryStore.findCategoryPath(id)
      if (path.length > 0 && path[0]) {
        const rootId = path[0].id
        path.forEach((cat) => {
          items.push({
            label: cat.name,
            path: cat.id === rootId ? `/category/${rootId}` : `/category/${rootId}?target=${cat.id}`,
          })
        })
      }
    }

    if (route.name === 'practice') {
      items.push({ label: '题目练习', path: '' })
    }
  } else if (route.name !== 'home') {
    items.push({
      label: (route.meta.title as string) || (route.name as string),
      path: '',
    })
  }

  return items
})

const handleBreadcrumbClick = (path: string) => {
  if (!path) return
  router.push(path)
}

function handleMenuUpdate(key: string) {

  if (isMobile.value) {
    showMobileMenu.value = false
  }

  if (key.startsWith('category-')) {
    const id = key.split('-')[1]
    router.push({ name: 'category', params: { id } })
  } else {
    router.push({ name: key })
  }
}

function renderMenuLabel(option: any) {
  return h(
    'div',
    { style: 'text-align: left; width: 100%;' },
    { default: () => (typeof option.label === 'function' ? option.label() : option.label) },
  )
}
</script>

<template>
  <template v-if="isMobile">
    <n-layout position="absolute">
      <n-layout-header class="navigation-surface" bordered style="height: 64px; padding: 0 16px;">
        <n-flex justify="space-between" align="center" style="height: 100%;" :wrap="false">
          <n-flex align="center" :wrap="false">
            <n-button quaternary circle size="large" @click="showMobileMenu = true" style="margin-right: 8px;">
              <template #icon>
                <n-icon><Navigation24Regular /></n-icon>
              </template>
            </n-button>
            <n-text strong depth="1" style="font-size: 16px; margin-left: 4px;">
              <n-ellipsis style="max-width: 120px">
                {{ breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1]?.label : '首页' }}
              </n-ellipsis>
            </n-text>
          </n-flex>
          <n-flex align="center" :wrap="false">
            <BankSwitcher />
            <n-button
              v-if="githubSyncStore.enabled"
              quaternary
              circle
              size="large"
              aria-label="GitHub 云同步状态"
              :title="githubSyncStore.error || (githubSyncStore.status === 'attention' ? '发现云端新数据，等待处理' : githubSyncStore.status === 'uploading' ? '正在上传同步数据' : githubSyncStore.status === 'downloading' ? '正在下载同步数据' : githubSyncStore.status === 'merging' ? '正在合并同步数据' : githubSyncStore.status === 'pending' ? '等待上传同步数据' : '云同步已完成')"
              @click="githubSyncStore.syncNow"
            >
              <template #icon><n-icon :class="{ 'sync-uploading': githubSyncStore.status === 'uploading' }" :color="syncIconColor"><component :is="syncIcon" /></n-icon></template>
            </n-button>
            <n-button quaternary circle size="large" aria-label="导入在线题库" title="导入在线题库" @click="handleSyncCloud">
              <template #icon>
                <n-icon><CloudArrowDown24Regular /></n-icon>
              </template>
            </n-button>
            <n-button quaternary circle size="large" @click="themeStore.toggleTheme">
              <template #icon>
                <n-icon>
                  <component :is="themeStore.isDark ? Sunny : Moon" />
                </n-icon>
              </template>
            </n-button>
          </n-flex>
        </n-flex>
      </n-layout-header>
      <n-layout-content
        class="page-background"
        :class="{ 'bank-management-layout': route.name === 'bank-management', 'bing-background': bingBackground, 'bing-background-ready': bingReady, 'light-background': !themeStore.isDark }"
        :style="homeBackgroundStyle"
        :content-style="{ padding: '16px', minHeight: '100%', boxSizing: 'border-box', position: 'relative' }"
        :native-scrollbar="false"
        style="position: absolute; top: 64px; bottom: 0; left: 0; right: 0;"
      >
        <router-view :key="`${route.fullPath}:${categoryStore.meta?.syncTime ?? 0}`" />
      </n-layout-content>
    </n-layout>
  </template>

  <template v-else>
    <n-layout position="absolute" has-sider>
      <n-layout-sider
        class="desktop-sidebar navigation-surface"
        bordered
        collapse-mode="width"
        :collapsed-width="64"
        :width="240"
        show-trigger
        :collapsed="collapsed"
        @collapse="collapsed = true"
        @expand="collapsed = false"
      >
        <n-flex :justify="collapsed ? 'center' : 'flex-start'" align="center" :wrap="false" :size="10" :style="{ height: '64px', paddingLeft: collapsed ? '0' : '24px', overflow: 'hidden' }">
          <img src="/surd-logo.svg" alt="Surd 无理 Logo" width="32" height="32" style="object-fit: contain; flex-shrink: 0;" />
          <n-gradient-text v-if="!collapsed" type="primary" :size="24" weight="bold" style="white-space: nowrap;">
            Surd 无理
          </n-gradient-text>
        </n-flex>
        <n-menu
          :value="(route.name as string)"
          :options="menuOptions"
          :collapsed="collapsed"
          :collapsed-width="64"
          :collapsed-icon-size="22"
          :indent="18"
          :root-indent="18"
          default-expand-all
          :watch-props="['defaultExpandedKeys']"
          :render-label="renderMenuLabel"
          @update:value="handleMenuUpdate"
        />
      </n-layout-sider>
      <n-layout position="absolute" style="left: 64px;">
        <n-layout-header class="navigation-surface" bordered position="absolute" style="height: 64px; padding: 0 24px;">
          <n-flex justify="space-between" align="center" style="height: 100%;">
            <n-breadcrumb
              v-if="route.name === 'question-canvas'"
              :key="`canvas-breadcrumb-${route.params.categoryId}-${categoryStore.meta?.syncTime ?? 0}`"
              separator="/"
              style="min-width: 0; margin-right: auto; text-align: left; overflow-x: auto; white-space: nowrap;"
            >
              <n-breadcrumb-item @click="router.push('/')">首页</n-breadcrumb-item>
              <n-breadcrumb-item @click="router.push('/card-map')">卡片地图</n-breadcrumb-item>
              <n-breadcrumb-item v-for="chapter in canvasChapterPath" :key="chapter.id">
                {{ chapter.name }}
              </n-breadcrumb-item>
            </n-breadcrumb>
            <n-breadcrumb v-else :key="route.fullPath" style="max-width: 60%; overflow: hidden; white-space: nowrap;">
              <n-breadcrumb-item
                v-for="(item, index) in breadcrumbs"
                :key="index"
                @click="handleBreadcrumbClick(item.path)"
                :style="{ cursor: item.path ? 'pointer' : 'default' }"
              >
                <n-ellipsis style="max-width: 150px">
                  {{ item.label }}
                </n-ellipsis>
              </n-breadcrumb-item>
            </n-breadcrumb>
            <n-flex align="center">
              <BankSwitcher />
              <n-button
                v-if="githubSyncStore.enabled"
                quaternary
                circle
                size="large"
                aria-label="GitHub 云同步状态"
                :title="githubSyncStore.error || (githubSyncStore.status === 'attention' ? '发现云端新数据，等待处理' : githubSyncStore.status === 'uploading' ? '正在上传同步数据' : githubSyncStore.status === 'downloading' ? '正在下载同步数据' : githubSyncStore.status === 'merging' ? '正在合并同步数据' : githubSyncStore.status === 'pending' ? '等待上传同步数据' : '云同步已完成')"
                @click="githubSyncStore.syncNow"
              >
                <template #icon><n-icon :class="{ 'sync-uploading': githubSyncStore.status === 'uploading' }" :color="syncIconColor"><component :is="syncIcon" /></n-icon></template>
              </n-button>
              <n-button quaternary circle size="large" aria-label="导入在线题库" title="导入在线题库" @click="handleSyncCloud">
                <template #icon>
                  <n-icon><CloudArrowDown24Regular /></n-icon>
                </template>
              </n-button>
              <n-button quaternary circle size="large" @click="themeStore.toggleTheme">
                <template #icon>
                  <n-icon>
                    <component :is="themeStore.isDark ? Sunny : Moon" />
                  </n-icon>
                </template>
              </n-button>
            </n-flex>
          </n-flex>
        </n-layout-header>
        <n-layout-content
        class="page-background"
        :class="{ 'bank-management-layout': route.name === 'bank-management', 'bing-background': bingBackground, 'bing-background-ready': bingReady, 'light-background': !themeStore.isDark }"
          :style="homeBackgroundStyle"
          content-style="padding: 24px; min-height: 100%; box-sizing: border-box; position: relative;"
          :native-scrollbar="false"
          style="position: absolute; top: 64px; bottom: 0; left: 0; right: 0;"
        >
          <router-view :key="`${route.fullPath}:${categoryStore.meta?.syncTime ?? 0}`" />
        </n-layout-content>
      </n-layout>
    </n-layout>
  </template>

  <SyncModal />

  <n-modal
    :show="githubSyncStore.remoteChangePending"
    preset="card"
    title="发现云端新数据"
    style="width: min(520px, calc(100vw - 32px));"
    :mask-closable="false"
    :close-on-esc="false"
  >
    <n-space vertical :size="16">
      <n-alert v-if="githubSyncStore.error" type="error" title="同步失败">
        {{ githubSyncStore.error }}
      </n-alert>
      <n-alert type="warning" title="请选择本次同步方向">
        GitHub 中的同步文件已在其他设备上更新。继续前请选择保留云端数据或当前设备的本地数据。
      </n-alert>
      <n-text depth="3">题库不会参与同步，也不会被此次操作修改。</n-text>
    </n-space>
    <template #footer>
      <n-flex justify="end" :size="8">
        <n-button
          :disabled="githubSyncStore.phase !== 'idle'"
          :loading="githubSyncStore.phase === 'uploading'"
          @click="githubSyncStore.resolveRemoteChange('local')"
        >
          本地覆盖云端
        </n-button>
        <n-button
          type="primary"
          :disabled="githubSyncStore.phase !== 'idle'"
          :loading="githubSyncStore.phase === 'downloading'"
          @click="githubSyncStore.resolveRemoteChange('cloud')"
        >
          云端覆盖本地
        </n-button>
      </n-flex>
    </template>
  </n-modal>

  <n-drawer class="navigation-surface" v-model:show="showMobileMenu" :width="280" placement="left">
    <n-drawer-content title="Surd 无理" closable>
      <n-menu
        :value="(route.name as string)"
        :options="menuOptions"
        :indent="18"
        :root-indent="18"
        default-expand-all
        :render-label="renderMenuLabel"
        @update:value="handleMenuUpdate"
      />
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.bing-background {
  isolation: isolate;
}

.page-background :deep(.n-card) {
  background-color: color-mix(in srgb, var(--n-color) 85%, transparent);
  backdrop-filter: blur(2px);
}


.page-background.light-background :deep(.n-card) {
  background-color: color-mix(in srgb, var(--n-color) 90%, transparent);
}

.navigation-surface {
  background-color: color-mix(in srgb, var(--n-color) 94%, transparent);
  backdrop-filter: blur(4px);
}

.bing-background::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: var(--bing-background) center / cover no-repeat;
  opacity: 0;
}

.bing-background-ready::before {
  animation: bing-wallpaper-in 650ms ease-out forwards;
}

@keyframes bing-wallpaper-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .bing-background-ready::before {
    animation: none;
    opacity: 1;
  }
}

.desktop-sidebar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
}

.sync-uploading {
  animation: sync-upload 900ms ease-in-out infinite;
}

@keyframes sync-upload {
  0%, 100% { transform: translateY(1px); }
  50% { transform: translateY(-2px); }
}

</style>

