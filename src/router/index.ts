import { createRouter, createWebHashHistory } from 'vue-router';
import MainLayout from '../layouts/MainLayout.vue';
import { questionEntryRoute } from './questionEntry';

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    questionEntryRoute,
    {
      path: '/',
      component: MainLayout,
      children: [
        {
          path: 'bank-management',
          name: 'bank-management',
          component: () => import('../views/bank/BankManagement.vue'),
          meta: { title: '题库管理' }
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('../views/settings/Index.vue'),
          meta: { title: '设置' }
        },
        {
          path: '',
          name: 'home',
          component: () => import('../views/home/Index.vue'),
        },
        {
          path: 'category/:id',
          name: 'category',
          component: () => import('../views/category/CategoryView.vue'),
          meta: { title: '章节目录' }
        },
        {
          path: 'card-map',
          name: 'card-map',
          component: () => import('../views/map/CardMap.vue'),
          meta: { title: '卡片地图' }
        },
        {
          path: 'question-canvas/:categoryId',
          name: 'question-canvas',
          component: () => import('../views/map/QuestionCanvas.vue'),
          meta: { title: '题目知识画布' }
        },
        {
          path: 'practice/:categoryId',
          name: 'practice',
          component: () => import('../views/practice/QuestionList.vue'),
          meta: { title: '题目练习' }
        },
        {
          path: 'mistakes',
          name: 'mistakes',
          component: () => import('../views/profile/WrongBook.vue'),
          meta: { title: '错题本' }
        },
        {
          path: 'favorites',
          name: 'favorites',
          component: () => import('../views/profile/Favorites.vue'),
          meta: { title: '收藏本' }
        },
      ],
    },
  ],
});

router.beforeEach((to) => {
  const baseTitle = 'Surd 无理';
  const subTitle = to.meta.title as string;
  document.title = subTitle ? `${subTitle} - ${baseTitle}` : baseTitle;
});

export default router;
