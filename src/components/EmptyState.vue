<script setup lang="ts">
import { NCard, NFlex, NIcon, NText, useThemeVars } from 'naive-ui'
import BoxDismiss24Regular from '@vicons/fluent/es/BoxDismiss24Regular'

withDefaults(defineProps<{
  page?: boolean
  description?: string
}>(), {
  page: false,
  description: '先在其他地方探索一下',
})

const themeVars = useThemeVars()
</script>

<template>
  <div class="empty-state" :class="{ 'empty-state--page': page }">
    <n-card class="empty-state-card" content-style="padding: 32px 24px;">
      <n-flex vertical align="center" :size="16">
        <n-icon size="40" :color="themeVars.primaryColor" aria-hidden="true"><BoxDismiss24Regular /></n-icon>
        <n-flex vertical align="center" :size="6">
          <n-text strong class="empty-title">这里空空如也</n-text>
          <n-text depth="3" class="empty-description">{{ description }}</n-text>
        </n-flex>
      </n-flex>
    </n-card>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex: 1;
  padding: 24px;
}

.empty-state--page { position: absolute; inset: 0; }
.empty-state-card {
  width: min(100%, 340px);
  flex: none;
  text-align: center;
}

.empty-title { font-size: v-bind('themeVars.fontSizeHuge'); }
.empty-description { font-size: v-bind('themeVars.fontSizeSmall'); line-height: v-bind('themeVars.lineHeight'); }
</style>
