import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuth } from '@/auth/useAuth'
import { recordVisit } from '@/utils/history'

/**
 * Hash-роутер: бэкенд раздаёт только статику `/app` без SPA-fallback,
 * поэтому пути живут в hash (`/app/#/groups`), а не в pathname.
 */

const routes = [
  { path: '/', redirect: '/groups' },
  {
    path: '/auth',
    name: 'auth',
    component: () => import('@/views/AuthView.vue'),
    meta: { public: true },
  },
  {
    path: '/groups',
    name: 'groups',
    component: () => import('@/views/GroupsView.vue'),
  },
  {
    path: '/notes',
    name: 'notes',
    component: () => import('@/views/NotesView.vue'),
  },
  {
    path: '/helpme',
    name: 'helpme',
    component: () => import('@/views/HelpMeView.vue'),
  },
  {
    path: '/users',
    name: 'users',
    component: () => import('@/views/UsersView.vue'),
    meta: { adminOnly: true },
  },
  {
    // Профиль доступен всем авторизованным: свой смотрит любой, чужой — тоже,
    // но управление (смена статуса) внутри скрыто за проверкой is_admin.
    path: '/user/:id(\\d+)',
    name: 'user',
    component: () => import('@/views/UserProfileView.vue'),
    props: true,
  },
  { path: '/:pathMatch(.*)*', redirect: '/groups' },
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuth()

  // Проверяем сессию один раз за жизнь вкладки (или после logout).
  if (!auth.checked.value) {
    await auth.fetchMe()
  }

  // Callback бота приходит на /auth?code=... — эту страницу показываем всегда.
  if (to.meta.public) {
    // Уже авторизованному экран входа не нужен (но код из ссылки бота обрабатываем).
    if (to.name === 'auth' && !to.query.code && auth.isAuthenticated.value) {
      const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : null
      return redirect || { name: 'groups' }
    }
    return true
  }

  if (!auth.isAuthenticated.value) {
    return { name: 'auth', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }

  if (to.meta.adminOnly && !auth.isAdmin.value) {
    return { name: 'groups' }
  }

  return true
})

router.afterEach((to) => {
  recordVisit(to)
})

export default router
