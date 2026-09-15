<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCategoryStore } from '../../store/category'
import { useMobile } from '../../utils/responsive'
import Book24Regular from '@vicons/fluent/es/Book24Regular'
import ChevronDown24Regular from '@vicons/fluent/es/ChevronDown24Regular'
import type { Category } from '../../api/types'
import DeepLevelItem from '../../components/Category/DeepLevelItem.vue'
import EmptyState from '../../components/EmptyState.vue'

const { isMobile } = useMobile()
const route = useRoute()
const router = useRouter()
const categoryStore = useCategoryStore()

const categoryId = computed(() => Number(route.params.id))
const categoryData = computed(() => categoryStore.getCategoryData(categoryId.value))

const expandedItems = ref<Set<number>>(new Set())

const toggleExpand = (id: number) => {
  if (expandedItems.value.has(id)) {
    expandedItems.value.delete(id)
  } else {
    expandedItems.value.add(id)
  }
}

const handleStartPractice = (category: Category, event: Event) => {
  event.stopPropagation()
  router.push(`/practice/${category.id}`)
}

const findFirstIncomplete = (category: Category): number[] | null => {
  if (!category.children || category.children.length === 0) {
    if (category.total_completed_count < category.total_question_count) {
      return [category.id]
    }
    return null
  }

  for (const child of category.children) {
    const path = findFirstIncomplete(child)
    if (path) {
      return [category.id, ...path]
    }
  }
  
  return null
}

const autoExpandTarget = (targetId: number) => {
  const path = categoryStore.findCategoryPath(targetId)
  if (path.length > 0 && path[0]) {
    const rootId = path[0].id
    if (rootId === categoryId.value) {
      path.forEach(cat => {
        if (cat.id !== targetId) {
          expandedItems.value.add(cat.id)
        }
      })
      
      setTimeout(() => {
        const element = document.getElementById(`category-${targetId}`)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 500)
    }
  }
}

const autoExpandFirstIncomplete = () => {
  if (categoryData.value && categoryData.value.children) {
    for (const level2 of categoryData.value.children) {
      const path = findFirstIncomplete(level2)
      if (path) {
        path.slice(0, -1).forEach(id => expandedItems.value.add(id))
        break
      }
    }
  }
}

const initExpansion = () => {
  expandedItems.value.clear()
  const target = route.query.target
  if (target) {
    autoExpandTarget(Number(target))
  } else {
    autoExpandFirstIncomplete()
  }
}

watch([categoryData, () => route.query.target], () => {
  initExpansion()
}, { immediate: true })
</script>

<template>
  <div class="category-view">
    <template v-if="categoryData">
      <n-space vertical size="large">
      <n-space vertical size="large">
        <!-- 移动端布局 -->
        <template v-if="isMobile">
          <n-space vertical :size="18">
            <n-card 
              v-for="level2 in categoryData.children" 
              :key="level2.id"
              size="small"
            >
              <template #header>
                <n-flex vertical :size="8">
                  <n-flex align="center" :size="8">
                    <n-icon size="20" color="var(--n-primary-color)">
                      <Book24Regular />
                    </n-icon>
                    <n-text strong>{{ level2.name }}</n-text>
                  </n-flex>
                  <n-flex align="center" justify="space-between">
                    <n-progress
                      type="line"
                      :percentage="level2.total_question_count > 0 ? Math.round((level2.total_completed_count / level2.total_question_count) * 100) : 0"
                      indicator-placement="inside"
                      processing
                      style="flex: 1; max-width: 180px;"
                    />
                    <n-flex align="center" :size="8">
                      <n-text depth="3" style="font-size: 12px; white-space: nowrap;">
                        {{ level2.total_completed_count }}/{{ level2.total_question_count }}
                      </n-text>
                      <n-tag :bordered="false" type="primary" size="small">
                        {{ level2.children.length }} 章节
                      </n-tag>
                    </n-flex>
                  </n-flex>
                </n-flex>
              </template>

              <n-divider style="margin: 0;" />

              <n-list class="category-list" :hoverable="!isMobile" clickable size="small">
                <template v-if="level2.children.length > 0">
                  <template v-for="level3 in level2.children" :key="level3.id">
                    <n-list-item :id="`category-${level3.id}`" @click="level3.children.length > 0 ? toggleExpand(level3.id) : handleStartPractice(level3, $event)">
                      <n-flex justify="space-between" align="center" :wrap="false">
                        <n-flex align="center" :size="8" style="flex: 1; min-width: 0;">
                          <n-badge dot type="success" />
                          <n-text ellipsis style="font-size: 14px;">{{ level3.name }}</n-text>
                          <n-icon 
                            v-if="level3.children.length > 0" 
                            size="14" 
                            :style="{ 
                              transform: expandedItems.has(level3.id) ? 'rotate(0deg)' : 'rotate(-90deg)',
                              transition: 'transform 0.3s'
                            }"
                          >
                            <ChevronDown24Regular />
                          </n-icon>
                        </n-flex>
                        <n-flex align="center" :size="8" style="flex-shrink: 0;">
                          <n-text depth="3" style="font-size: 12px; white-space: nowrap;">
                            {{ level3.total_completed_count }}/{{ level3.total_question_count }}
                          </n-text>
                          <n-button 
                            v-if="level3.children.length === 0" 
                            secondary
                            type="primary"
                            size="small"
                            @click="handleStartPractice(level3, $event)"
                          >
                            立即练习
                          </n-button>
                        </n-flex>
                      </n-flex>
                    </n-list-item>

                    <template v-if="expandedItems.has(level3.id) && level3.children.length > 0">
                      <n-space vertical :size="0" style="margin-left: 20px;">
                        <template v-for="level4 in level3.children" :key="level4.id">
                          <n-list-item 
                            :id="`category-${level4.id}`"
                            @click="level4.children.length > 0 ? toggleExpand(level4.id) : handleStartPractice(level4, $event)"
                          >
                            <n-flex justify="space-between" align="center" :wrap="false">
                              <n-flex align="center" :size="8" style="flex: 1; min-width: 0;">
                                <n-icon 
                                  v-if="level4.children.length > 0"
                                  size="12" 
                                  depth="3"
                                  :style="{ 
                                    transform: expandedItems.has(level4.id) ? 'rotate(0deg)' : 'rotate(-90deg)',
                                    transition: 'transform 0.3s'
                                  }"
                                >
                                  <ChevronDown24Regular />
                                </n-icon>
                                <n-text depth="2" style="font-size: 13px;" ellipsis>{{ level4.name }}</n-text>
                              </n-flex>
                              <n-flex align="center" :size="8" style="flex-shrink: 0;">
                                <n-text depth="3" style="font-size: 11px; white-space: nowrap;">
                                  {{ level4.total_completed_count }}/{{ level4.total_question_count }}
                                </n-text>
                                <n-button 
                                  v-if="level4.children.length === 0"
                                  secondary
                                  type="primary"
                                  size="small"
                                  @click="handleStartPractice(level4, $event)"
                                >
                                  立即练习
                                </n-button>
                              </n-flex>
                            </n-flex>
                          </n-list-item>

                          <template v-if="expandedItems.has(level4.id) && level4.children.length > 0">
                            <DeepLevelItem 
                              v-for="deepItem in level4.children" 
                              :key="deepItem.id"
                              :category="deepItem"
                              :depth="5"
                              :expanded-items="expandedItems"
                              @toggle="toggleExpand"
                              @practice="handleStartPractice"
                            />
                          </template>
                        </template>
                      </n-space>
                      <n-divider style="margin: 0;" />
                    </template>
                  </template>
                </template>
                <template v-else>
                  <n-list-item @click="handleStartPractice(level2, $event)">
                    <n-flex justify="space-between" align="center" :wrap="false">
                      <n-flex align="center" :size="8" style="flex: 1; min-width: 0;">
                        <n-badge dot type="success" />
                        <n-text ellipsis>{{ level2.name }}</n-text>
                      </n-flex>
                      <n-flex align="center" :size="8" style="flex-shrink: 0;">
                        <n-text depth="3" style="font-size: 12px; white-space: nowrap;">
                          {{ level2.total_completed_count }}/{{ level2.total_question_count }}
                        </n-text>
                        <n-button 
                          secondary
                          type="primary"
                          size="small"
                          @click="handleStartPractice(level2, $event)"
                        >
                          立即练习
                        </n-button>
                      </n-flex>
                    </n-flex>
                  </n-list-item>
                </template>
              </n-list>
            </n-card>
          </n-space>
        </template>

        <!-- 桌面端布局 -->
        <template v-else>
          <n-space vertical :size="26">
            <n-card 
              v-for="level2 in categoryData.children" 
              :key="level2.id" 
            >
              <template #header>
                <n-flex align="center" :size="8">
                  <n-icon size="20" color="var(--n-primary-color)">
                    <Book24Regular />
                  </n-icon>
                  <n-text strong>{{ level2.name }}</n-text>
                </n-flex>
              </template>

              <template #header-extra>
                <n-space align="center" :size="16">
                  <n-progress
                    type="line"
                    :percentage="level2.total_question_count > 0 ? Math.round((level2.total_completed_count / level2.total_question_count) * 100) : 0"
                    indicator-placement="inside"
                    processing
                    style="width: 200px;"
                  />
                  <n-text depth="3">
                    {{ level2.total_completed_count }}/{{ level2.total_question_count }}
                  </n-text>
                  <n-tag :bordered="false" type="primary" size="small">
                    {{ level2.children.length }} 章节
                  </n-tag>
                </n-space>
              </template>

              <n-divider style="margin: 0;" />

              <n-list class="category-list" hoverable clickable>
                <template v-if="level2.children.length > 0">
                  <template v-for="level3 in level2.children" :key="level3.id">
                    <n-list-item :id="`category-${level3.id}`" @click="level3.children.length > 0 ? toggleExpand(level3.id) : handleStartPractice(level3, $event)">
                      <n-flex justify="space-between" align="center">
                        <n-flex align="center" :size="8">
                          <n-badge dot type="success" />
                          <n-text>{{ level3.name }}</n-text>
                          <n-icon 
                            v-if="level3.children.length > 0" 
                            size="16" 
                            :style="{ 
                              transform: expandedItems.has(level3.id) ? 'rotate(0deg)' : 'rotate(-90deg)',
                              transition: 'transform 0.3s'
                            }"
                          >
                            <ChevronDown24Regular />
                          </n-icon>
                        </n-flex>

                        <n-flex align="center" :size="24">
                          <n-text depth="3">
                            {{ level3.total_completed_count }}/{{ level3.total_question_count }}
                          </n-text>
                          <n-button 
                            v-if="level3.children.length === 0" 
                            secondary
                            type="primary"
                            size="small"
                            @click="handleStartPractice(level3, $event)"
                          >
                            立即练习
                          </n-button>
                        </n-flex>
                      </n-flex>
                    </n-list-item>

                    <template v-if="expandedItems.has(level3.id) && level3.children.length > 0">
                      <n-space vertical :size="0" style="margin-left: 40px;">
                        <template v-for="level4 in level3.children" :key="level4.id">
                          <n-list-item 
                            :id="`category-${level4.id}`"
                            @click="level4.children.length > 0 ? toggleExpand(level4.id) : handleStartPractice(level4, $event)"
                          >
                            <n-flex justify="space-between" align="center">
                              <n-flex align="center" :size="8">
                                <n-icon 
                                  v-if="level4.children.length > 0"
                                  size="14" 
                                  depth="3"
                                  :style="{ 
                                    transform: expandedItems.has(level4.id) ? 'rotate(0deg)' : 'rotate(-90deg)',
                                    transition: 'transform 0.3s'
                                  }"
                                >
                                  <ChevronDown24Regular />
                                </n-icon>
                                <n-text depth="2">{{ level4.name }}</n-text>
                              </n-flex>
                              <n-flex align="center" :size="12">
                                <n-text depth="3">
                                  {{ level4.total_completed_count }}/{{ level4.total_question_count }}
                                </n-text>
                                <n-button 
                                  v-if="level4.children.length === 0"
                                  secondary
                                  type="primary"
                                  size="small"
                                  @click="handleStartPractice(level4, $event)"
                                >
                                  立即练习
                                </n-button>
                              </n-flex>
                            </n-flex>
                          </n-list-item>

                          <template v-if="expandedItems.has(level4.id) && level4.children.length > 0">
                            <DeepLevelItem 
                              v-for="deepItem in level4.children" 
                              :key="deepItem.id"
                              :category="deepItem"
                              :depth="5"
                              :expanded-items="expandedItems"
                              @toggle="toggleExpand"
                              @practice="handleStartPractice"
                            />
                          </template>
                        </template>
                      </n-space>
                      <n-divider style="margin: 0;" />
                    </template>
                  </template>
                </template>
                <template v-else>
                  <n-list-item @click="handleStartPractice(level2, $event)">
                    <n-flex justify="space-between" align="center">
                      <n-flex align="center" :size="8">
                        <n-badge dot type="success" />
                        <n-text>{{ level2.name }}</n-text>
                      </n-flex>

                      <n-flex align="center" :size="24">
                        <n-text depth="3">
                          {{ level2.total_completed_count }}/{{ level2.total_question_count }}
                        </n-text>
                        <n-button 
                          secondary
                          type="primary"
                          size="small"
                          @click="handleStartPractice(level2, $event)"
                        >
                          立即练习
                        </n-button>
                      </n-flex>
                    </n-flex>
                  </n-list-item>
                </template>
              </n-list>
            </n-card>
          </n-space>
        </template>
      </n-space>
      </n-space>
    </template>
    <template v-else>
      <EmptyState page />
    </template>
  </div>
</template>

<style scoped>
.category-view {
  width: 100%;
}

.category-list {
  background-color: transparent;
}

@media (max-width: 768px) {
  :deep(.n-list-item) {
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }
}
</style>
