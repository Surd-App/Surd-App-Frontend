<script setup lang="ts">
import type { Question } from '../../api/types'
import LatexRender from '../Latex/LatexRender.vue'
defineProps<{ question: Question; isMobile?: boolean }>()
</script>
<template>
      <LatexRender :content="question.题目内容" />

      <template v-if="question.选项A || question.选项B || question.选项C || question.选项D">
        <n-grid :cols="isMobile ? 1 : 2" :x-gap="12" :y-gap="12">
          <n-grid-item v-if="question.选项A">
            <LatexRender :content="`A. ${question.选项A}`" />
          </n-grid-item>
          <n-grid-item v-if="question.选项B">
            <LatexRender :content="`B. ${question.选项B}`" />
          </n-grid-item>
          <n-grid-item v-if="question.选项C">
            <LatexRender :content="`C. ${question.选项C}`" />
          </n-grid-item>
          <n-grid-item v-if="question.选项D">
            <LatexRender :content="`D. ${question.选项D}`" />
          </n-grid-item>
        </n-grid>
      </template>

</template>
