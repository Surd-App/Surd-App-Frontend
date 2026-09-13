import type { Router, RouteRecordRaw } from 'vue-router'

export const questionEntryRoute: RouteRecordRaw = {
  path: '/question-entry',
  component: () => import('../layouts/MainLayout.vue'),
  children: [
    {
      path: '',
      name: 'question-entry',
      component: () => import('../views/bank/QuestionEntry.vue'),
      meta: { title: '题目录入' },
    },
  ],
}

export function ensureQuestionEntryRoute(router: Router) {
  if (!router.hasRoute('question-entry')) router.addRoute(questionEntryRoute)
}
