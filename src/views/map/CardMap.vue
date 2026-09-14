<script setup lang="ts">
import { useRouter } from 'vue-router'
import { computed } from 'vue'
import { useCategoryStore } from '../../store/category'
import { Map24Regular, Book24Regular } from '@vicons/fluent'


const categoryStore = useCategoryStore()
const roots = computed(() => categoryStore.roots)

const router = useRouter()
</script>

<template>
  <n-space vertical :size="24" class="card-map">
    <n-page-header class="content-page-header">
      <template #title>
        <n-flex align="center" :size="8">
          <n-icon size="26" color="var(--n-primary-color)"><Map24Regular /></n-icon>
          <span>卡片地图</span>
        </n-flex>
      </template>
    </n-page-header>

    <n-empty v-if="roots.length === 0" description="暂无题库，请先导入在线题库" />
    <n-space v-for="root in roots" :key="root.id" vertical :size="12">
      <n-flex align="center" :size="8">
        <n-icon size="20" color="var(--n-primary-color)"><Book24Regular /></n-icon>
        <n-text strong style="font-size: 20px">{{ root.name }}</n-text>
        <n-tag size="small" :bordered="false">{{ root.total_question_count }} 题</n-tag>
      </n-flex>
      <n-grid :cols="'1 s:2 m:3 l:4'" responsive="screen" :x-gap="12" :y-gap="12">
        <n-grid-item v-for="category in root.children" :key="category.id">
          <n-card size="small" :title="category.name" class="map-card">
            <n-space vertical :size="12">
              <n-flex justify="space-between" align="center">
                <n-statistic label="题目总量" :value="category.total_question_count" />
                <n-statistic label="已经掌握" :value="category.total_completed_count" />
              </n-flex>
              <n-progress
                type="line"
                :percentage="category.total_question_count ? Math.round(category.total_completed_count / category.total_question_count * 100) : 0"
                :show-indicator="false"
              />
              <n-button block secondary @click="router.push(`/question-canvas/${category.id}`)">进入地图</n-button>
            </n-space>
          </n-card>
        </n-grid-item>
      </n-grid>
    </n-space>
  </n-space>
</template>

<style scoped>
.card-map {
  width: 100%;
}

.map-card {
  height: 100%;
}
</style>
