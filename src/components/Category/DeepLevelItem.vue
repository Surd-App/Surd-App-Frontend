<script setup lang="ts">
import ChevronDown24Regular from '@vicons/fluent/es/ChevronDown24Regular'
import type { Category } from '../../api/types'
import { useMobile } from '../../utils/responsive'

const { isMobile } = useMobile()

defineProps<{
  category: Category
  depth: number
  expandedItems: Set<number>
}>()

const emit = defineEmits<{
  toggle: [id: number]
  practice: [category: Category, event: Event]
}>()

const handleClick = (category: Category, event: Event) => {
  if (category.children.length > 0) {
    emit('toggle', category.id)
  } else {
    emit('practice', category, event)
  }
}

const handlePracticeClick = (category: Category, event: Event) => {
  event.stopPropagation()
  emit('practice', category, event)
}
</script>

<template>
  <n-space vertical :size="0" :style="{ marginLeft: `${depth * 8}px` }">
    <n-list-item :id="`category-${category.id}`" @click="handleClick(category, $event)">
      <n-flex justify="space-between" align="center" :wrap="false">
        <n-flex align="center" :size="6" style="flex: 1; min-width: 0;">
          <n-icon 
            v-if="category.children.length > 0"
            size="12" 
            depth="3"
            :style="{ 
              transform: expandedItems.has(category.id) ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.3s'
            }"
          >
            <ChevronDown24Regular />
          </n-icon>
          <n-text depth="2" ellipsis>{{ category.name }}</n-text>
        </n-flex>
        <n-flex align="center" :size="isMobile ? 4 : 8" style="flex-shrink: 0;">
          <n-text depth="3" :style="{ fontSize: isMobile ? '11px' : 'inherit', whiteSpace: 'nowrap' }">
            {{ category.total_completed_count }}/{{ category.total_question_count }}
          </n-text>
          <n-button 
            v-if="category.children.length === 0"
            secondary
            type="primary"
            :size="isMobile ? 'small' : 'medium'"
            @click="handlePracticeClick(category, $event)"
          >
            立即练习
          </n-button>
        </n-flex>
      </n-flex>
    </n-list-item>

    <template v-if="expandedItems.has(category.id) && category.children.length > 0">
      <DeepLevelItem 
        v-for="child in category.children" 
        :key="child.id"
        :category="child"
        :depth="depth + 1"
        :expanded-items="expandedItems"
        @toggle="(id) => emit('toggle', id)"
        @practice="(cat, ev) => emit('practice', cat, ev)"
      />
    </template>
  </n-space>
</template>
