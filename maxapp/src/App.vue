<script setup>
import { useRoute, useRouter, RouterLink, RouterView } from 'vue-router'
import { useAuth } from '@/auth/useAuth'
import { navHistory } from '@/utils/history'

const route = useRoute()
const router = useRouter()
const { user, isAuthenticated, isAdmin } = useAuth()

function goBack() {
  router.back()
}
</script>

<template>
  <header class="topbar">
    <div class="topbar-inner">
      <!-- <RouterLink class="brand" :to="{ name: 'groups' }">Материалы MAX</RouterLink> -->

      <nav v-if="isAuthenticated" class="nav">
        <RouterLink class="brand" :to="{ name: 'groups' }">Кафедры</RouterLink>
        <RouterLink v-if="isAdmin" :to="{ name: 'users' }">Пользователи</RouterLink>
      </nav>

      <div v-if="isAuthenticated && user.user_id" class="user">
        <span v-if="isAdmin" class="badge">админ</span>
        <RouterLink class="profile-link" :to="{ name: 'user', params: { id: user.user_id } }" title="Мой профиль">
          {{ user.first_name || user.username }}
        </RouterLink>
      </div>
    </div>
    <div style="display: flex;    justify-content: center;">
      <nav v-if="isAuthenticated && navHistory.entries.length" class="history-nav">
        <button class="history-back" type="button" @click="goBack">Назад</button>
        <RouterLink v-for="entry in navHistory.entries" :key="entry.path" :to="entry.path"
          :class="{ current: entry.path === route.fullPath }" :title="entry.label">
          {{ entry.label }}
        </RouterLink>
      </nav>
    </div>
  </header>
 
  <main class="page">
    <RouterView />
  </main>
</template>

<style scoped>
.topbar {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.topbar-inner {
  max-width: 1080px;
  margin: 0 auto;
  padding: 0.75rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.brand {
  font-weight: 600;
  text-decoration: none;
  color: var(--text);
}

.nav {
  display: flex;
  gap: 1rem;
  flex: 1;
}

.nav a {
  text-decoration: none;
  color: var(--text-muted);
  padding: 0.25rem 0;
  border-bottom: 2px solid transparent;
}

.nav a.router-link-active {
  color: var(--text);
  border-bottom-color: var(--accent);
}

.history-nav {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.history-nav a {
  color: var(--text-muted);
  text-decoration: none;
  padding-bottom: 1px;
  border-bottom: 1px solid transparent;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 9rem;
}

.history-nav a:hover {
  color: var(--accent);
}

.history-nav a.current {
  color: var(--text);
  border-bottom-color: currentColor;
}

.history-back {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: inherit;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.history-back:hover:not(:disabled) {
  background: transparent;
  color: var(--accent);
}

.user {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.profile-link {
  color: var(--text);
  text-decoration: none;
  padding: 0.25rem 0.55rem;
  border-radius: var(--radius);
  border: 1px solid transparent;
}

.profile-link:hover {
  border-color: var(--border);
  color: var(--accent);
}

.profile-link.router-link-active {
  border-color: var(--accent);
  color: var(--accent);
}

.badge {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: rgba(47, 111, 237, 0.12);
  color: var(--accent);
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
}

.page {
  max-width: 1080px;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
}
</style>
