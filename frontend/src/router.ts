import { createRouter, createWebHistory } from 'vue-router';
import { authState, restoreSession } from './lib/auth';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'login', component: () => import('./views/AuthView.vue'), meta: { public: true } },
    { path: '/dashboard', name: 'dashboard', component: () => import('./views/DashboardView.vue') },
    { path: '/contacts', name: 'contacts', component: () => import('./views/ContactsView.vue') },
    { path: '/history', name: 'history', component: () => import('./views/HistoryView.vue') },
    { path: '/journeys', name: 'journeys', component: () => import('./views/JourneysView.vue') },
    {
      path: '/track/:token',
      name: 'track',
      component: () => import('./views/PublicTrackingView.vue'),
      meta: { public: true }
    },
    {
      path: '/contact/confirm/:token',
      name: 'confirm-contact',
      component: () => import('./views/ContactConfirmView.vue'),
      meta: { public: true }
    },
    {
      path: '/contact/opt-out/:token',
      name: 'opt-out-contact',
      component: () => import('./views/ContactOptOutView.vue'),
      meta: { public: true }
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('./views/LegalView.vue'),
      meta: { public: true, document: 'privacy' }
    },
    {
      path: '/terms',
      name: 'terms',
      component: () => import('./views/LegalView.vue'),
      meta: { public: true, document: 'terms' }
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
});

router.beforeEach(async (to) => {
  if (!authState.ready) await restoreSession();
  if (!to.meta.public && !authState.user) return { name: 'login', query: { returnTo: to.fullPath } };
  if (to.name === 'login' && authState.user) return { name: 'dashboard' };
  return true;
});
