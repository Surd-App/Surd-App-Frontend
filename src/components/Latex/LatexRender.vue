<script setup lang="ts">
import { computed } from 'vue'
import { cachedQuestionContent } from '../../utils/questionContentCache'

const props = defineProps<{
  content: string
}>()

const renderedContent = computed(() => cachedQuestionContent(props.content))
</script>

<template>
  <div v-html="renderedContent" class="latex-render-content"></div>
</template>

<style scoped>
@font-face {
  font-family: 'SurdKaTeXText';
  src: url('../../assets/FangZhengShuSong_Regular.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

.latex-render-content {
  text-align: left;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.8;
  font-size: 1.15rem;
  font-family: 'SurdKaTeXText', system-ui, sans-serif;
}

:deep(.katex-display) {
  margin: 0.8em 0;
  overflow-x: auto;
  overflow-y: hidden;
}

:deep(.katex) {
  font-size: 1.05em;
  white-space: normal;
  overflow-wrap: normal;
}

:deep(.katex .mord.text),
:deep(.katex .mord.text span) {
  font-family: 'SurdKaTeXText', KaTeX_Main, serif !important;
}
</style>
