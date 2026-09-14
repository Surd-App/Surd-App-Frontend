<script setup lang="ts">
import { ref, onMounted, shallowRef } from 'vue'
import { useCategoryStore } from '../../store/category'
import { useMobile } from '../../utils/responsive'
import type { Notification, UserQuestionState } from '../../api/types'
import AnnouncementModal from '../../components/Interaction/AnnouncementModal.vue'
import upAvatar from '../../assets/chengxiaoyu-avatar.jpg'
import qrCode from '../../assets/qrcode.jpg'
import MasteryOverview from '../../components/Home/MasteryOverview.vue'
import { readBank, readStates, type LocalBank } from '../../utils/questionBank'

const categoryStore = useCategoryStore()
const liveAnnouncements: Notification[] = []
const { isMobile } = useMobile()
const selectedAnno = ref<Notification | null>(null)
const showModal = ref(false)
const bank = shallowRef<LocalBank | null>(null)
const states = shallowRef<Record<number, UserQuestionState>>({})
const loading = ref(true)
const loadError = ref('')

const handleShowDetail = (anno: Notification) => {
  selectedAnno.value = anno
  showModal.value = true
}

async function loadHome() {
  loading.value = true
  loadError.value = ''
  try {
    await categoryStore.initialize()
    const nextBank = await readBank()
    const nextStates = nextBank
      ? await readStates(nextBank.manifest.questionBank.subjectCode)
      : {}
    bank.value = nextBank
    states.value = nextStates
  } catch (cause) {
    loadError.value = cause instanceof Error ? cause.message : '首页数据加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadHome)
</script>

<template>
  <div class="home-page">
    <n-alert v-if="loadError" type="error" title="首页数据加载失败">
      {{ loadError }}
      <template #action>
        <n-button size="small" :loading="loading" @click="loadHome">重试</n-button>
      </template>
    </n-alert>

    <n-spin class="home-loading" :show="loading" content-style="min-height: 100%;">
      <n-space
        v-if="!loadError"
        class="home-content"
        :class="{ 'home-content-ready': !loading }"
        vertical
        size="large"
      >
        <MasteryOverview :bank="bank" :states="states" />

    <!-- 移动端布局 -->
    <template v-if="isMobile">
      <n-grid :cols="1" :y-gap="12">
        <n-grid-item>
          <n-card title="Bilibili 推广" :segmented="{ content: true }">
            <n-flex vertical align="center" :size="16">
              <n-avatar round :size="64" :src="upAvatar" style="border: 2px solid var(--n-primary-color);" />
              <n-flex vertical align="center" :size="4">
                <n-gradient-text type="primary" :size="16" weight="bold">澄潇宇</n-gradient-text>
              </n-flex>
              <n-button type="primary" ghost round size="small" tag="a" href="https://space.bilibili.com/6536560" target="_blank">
                前往关注
              </n-button>
            </n-flex>
          </n-card>
        </n-grid-item>

        <n-grid-item>
          <n-card title="微信公众号" :segmented="{ content: true }">
            <n-flex vertical align="center" justify="center" :size="12">
              <n-image width="100" :src="qrCode" preview-disabled style="border-radius: 8px;" />
              <n-text strong style="font-size: 14px;">帕拉迪宇</n-text>
            </n-flex>
          </n-card>
        </n-grid-item>

        <n-grid-item>
          <n-card title="公告看板" :segmented="{ content: true }" :content-style="{ padding: '0px' }">
              <n-list v-if="liveAnnouncements.length > 0" hoverable clickable :bordered="false">
                <template v-for="(anno, index) in liveAnnouncements" :key="anno.id">
                  <n-list-item @click="handleShowDetail(anno)" style="padding: 12px 16px;">
                    <n-flex vertical :size="4" align="start">
                      <n-text depth="3" style="font-size: 11px;">{{ new Date(anno.created_at).toLocaleDateString() }}</n-text>
                      <n-text strong ellipsis style="font-size: 13px; width: 100%; text-align: left;">
                        {{ anno.title }}
                      </n-text>
                    </n-flex>
                  </n-list-item>
                  <n-divider v-if="index < liveAnnouncements.length - 1" style="margin: 0;" />
                </template>
              </n-list>
              <n-flex v-else vertical align="center" justify="center" style="height: 120px;">
                <n-empty description="暂无公告" />
              </n-flex>
          </n-card>
        </n-grid-item>
      </n-grid>
    </template>

    <!-- 桌面端布局 -->
    <template v-else>
      <n-grid :cols="3" :x-gap="12" :y-gap="12">
        <n-grid-item>
          <n-card title="Bilibili 推广" :segmented="{ content: true }" style="height: 100%;">
            <n-flex vertical align="center" :size="16">
              <n-avatar round :size="80" :src="upAvatar" style="border: 2px solid var(--n-primary-color);" />
              <n-flex vertical align="center" :size="4">
                <n-gradient-text type="primary" :size="18" weight="bold">澄潇宇</n-gradient-text>
              </n-flex>
              <n-text depth="3" style="text-align: center; font-size: 13px;">
                打破考研信息差，助你轻松备考
              </n-text>
              <n-button type="primary" ghost round tag="a" href="https://space.bilibili.com/6536560" target="_blank">
                前往关注
              </n-button>
            </n-flex>
          </n-card>
        </n-grid-item>

        <n-grid-item>
          <n-card title="微信公众号" :segmented="{ content: true }" style="height: 100%;">
            <n-flex vertical align="center" justify="center" :size="12" style="height: 100%; min-height: 200px;">
              <n-image width="120" :src="qrCode" preview-disabled style="border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
              <n-flex vertical align="center" :size="4">
                <n-text strong :size="16" style="text-align: center;">帕拉迪宇</n-text>
                <n-text depth="3" style="font-size: 12px; text-align: center;">
                  扫码关注获取更多考研资料
                </n-text>
              </n-flex>
            </n-flex>
          </n-card>
        </n-grid-item>

        <n-grid-item>
          <n-card title="公告看板" :segmented="{ content: true }" :content-style="{ padding: '0px' }" style="height: 100%;">
              <template v-if="liveAnnouncements.length > 0">
                <n-list hoverable clickable :bordered="false">
                  <template v-for="(anno, index) in liveAnnouncements" :key="anno.id">
                    <n-list-item @click="handleShowDetail(anno)" style="padding: 12px 16px;">
                      <n-flex vertical :size="8" align="start">
                        <n-flex align="center" :size="12" style="width: 100%;">
                          <n-tag :type="anno.type === 'announcement' ? 'info' : 'success'" size="small" round>
                            {{ anno.type === 'announcement' ? '公告' : '通知' }}
                          </n-tag>
                          <n-text depth="3" style="font-size: 12px;">{{ new Date(anno.created_at).toLocaleDateString() }}</n-text>
                        </n-flex>
                        <n-text strong ellipsis style="font-size: 14px; width: 100%; text-align: left;">
                          {{ anno.title }}
                        </n-text>
                      </n-flex>
                    </n-list-item>
                    <n-divider v-if="index < liveAnnouncements.length - 1" style="margin: 0;" />
                  </template>
                </n-list>
              </template>
              <template v-else>
                <n-flex vertical align="center" justify="center" style="height: 200px;">
                  <n-empty description="暂无公告" />
                </n-flex>
              </template>
          </n-card>
        </n-grid-item>
      </n-grid>
    </template>

        <AnnouncementModal
          v-model:show="showModal"
          :notification="selectedAnno"
        />
      </n-space>
    </n-spin>
  </div>
</template>

<style scoped>
.home-page {
  min-height: calc(100dvh - 112px);
}

.home-loading {
  min-height: calc(100dvh - 112px);
}

.home-content {
  visibility: hidden;
  opacity: 0;
  transition: opacity 240ms ease;
}

.home-content-ready {
  visibility: visible;
  opacity: 1;
}
</style>
