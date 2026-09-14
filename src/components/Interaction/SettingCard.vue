<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useThemeVars } from 'naive-ui'

defineProps<{ title: string; description: string; icon: Component }>()
const themeVars = useThemeVars()
const iconSize = computed(() => Number.parseFloat(themeVars.value.fontSizeHuge) * 1.5)
</script>

<template>
  <n-list-item class="setting-item">
    <div class="setting-row">
      <div class="setting-heading">
        <div class="setting-icon" aria-hidden="true">
          <n-icon :size="iconSize"><component :is="icon" /></n-icon>
        </div>
        <div class="setting-description">
          <n-text strong class="setting-title">{{ title }}</n-text>
          <n-text depth="3" class="setting-detail">{{ description }}</n-text>
        </div>
      </div>
      <div class="setting-actions"><slot name="actions" /></div>
    </div>
    <slot />
  </n-list-item>
</template>

<style scoped>
.setting-item :deep(.n-list-item__main) { width: 100%; }
.setting-item { padding-top: 18px; padding-bottom: 18px; }
.setting-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px; text-align: left; }
.setting-heading { display: flex; align-items: center; flex: 1 1 260px; min-width: 0; gap: 14px; }
.setting-icon { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex-shrink: 0; color: v-bind('themeVars.primaryColor'); }
.setting-description { display: flex; flex-direction: column; min-width: 0; gap: 4px; }
.setting-title { font-size: v-bind('themeVars.fontSizeHuge'); line-height: v-bind('themeVars.lineHeight'); }
.setting-detail { font-size: v-bind('themeVars.fontSizeSmall'); line-height: v-bind('themeVars.lineHeight'); }
.setting-actions { flex-shrink: 0; max-width: 100%; }
@media (width < 768px) {
  .setting-row { gap: 16px; }
  .setting-actions { margin-left: 58px; max-width: calc(100% - 58px); }
}
</style>
