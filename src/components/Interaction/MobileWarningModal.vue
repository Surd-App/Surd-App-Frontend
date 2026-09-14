<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useMobile } from '../../utils/responsive'

const { isMobile } = useMobile()
const show = ref(false)
const countdown = ref(5)
const canClose = ref(false)

const startCountdown = () => {
  const timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(timer)
      canClose.value = true
    }
  }, 1000)
}

const handleClose = () => {
  show.value = false
}

onMounted(() => {
  if (isMobile.value) {
    show.value = true
    startCountdown()
  }
})

watch(isMobile, (newVal) => {
  if (newVal && !show.value) {
    show.value = true
    countdown.value = 5
    canClose.value = false
    startCountdown()
  }
})
</script>

<template>
  <n-modal
    v-model:show="show"
    preset="card"
    style="width: 90%; max-width: 450px"
    title="屏幕缩放警告"
    :mask-closable="false"
    :closable="false"
    :bordered="false"
  >
    <n-space vertical size="large">
      <n-text depth="2" style="line-height: 1.6; font-size: 16px;">
        Surd 无理目前只适配了Pad和PC端的横屏显示，移动设备适配正在进行中，可能无法正常浏览体验！请更换设备获得最佳体验。
      </n-text>
      
      <n-button 
        type="primary" 
        block 
        size="large" 
        :disabled="!canClose" 
        @click="handleClose"
      >
        {{ canClose ? '我已知晓' : `我已知晓 (${countdown}s)` }}
      </n-button>
    </n-space>
  </n-modal>
</template>
