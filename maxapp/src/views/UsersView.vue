<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '@/api/client'
import { displayUserName } from '@/utils/user'

const users = ref([])
const loading = ref(true)
const loadError = ref('')

/** Бэкенд отдаёт список только админу; страница тоже закрыта guard'ом. */
async function loadUsers() {
  loading.value = true
  loadError.value = ''
  try {
    users.value = (await api.listUsers()) || []
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

function isAdminRow(value) {
  return value === 1 || value === true
}

onMounted(loadUsers)
</script>

<template>
  <section>
    <header class="page-header">
      <h1>Пользователи</h1>
      <span class="muted">Всего: {{ users.length }}</span>
    </header>

    <p v-if="loadError" class="error-box">{{ loadError }}</p>
    <p v-if="loading" class="muted">Загрузка…</p>
    <p v-else-if="!users.length && !loadError" class="empty">Пользователей нет.</p>

    <table v-else class="users">
      <thead>
        <tr>
          <th>Пользователь</th>
          <th>Логин</th>
          <th>Телефон</th>
          <th class="col-count">Материалов</th>
          <th>Права</th>
          <th class="col-actions"><span class="visually-hidden">Действия</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in users" :key="item.user_id">
          <td>
            <div class="cell-user">
              <img
                v-if="item.avatar_url"
                :src="item.avatar_url"
                :alt="displayUserName(item)"
                class="avatar"
              />
              <div>
                <div>{{ displayUserName(item) }}</div>
                <div class="muted small">ID: {{ item.user_id }}</div>
              </div>
            </div>
          </td>
          <td>{{ item.username || '—' }}</td>
          <td>{{ item.phone || '—' }}</td>
          <td class="col-count">{{ item.notes_count ?? 0 }}</td>
          <td>
            <span v-if="isAdminRow(item.is_admin)" class="badge">админ</span>
            <span v-else class="muted">пользователь</span>
          </td>
          <td class="col-actions">
            <RouterLink
              class="details-link"
              :to="{ name: 'user', params: { id: item.user_id } }"
            >
              Подробнее
            </RouterLink>
          </td>
        </tr>
      </tbody>
    </table>

    <p class="muted small footnote">
      Изменение статуса пользователя и работа с его материалами — на странице профиля.
    </p>
  </section>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}

.users {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.users th,
.users td {
  text-align: left;
  padding: 0.7rem 0.9rem;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.users th {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
  background: #fafbfd;
}

.users tr:last-child td {
  border-bottom: none;
}

/* Специфичность выше, чем у `.users th, .users td`, иначе text-align не применится */
.users th.col-actions,
.users td.col-actions {
  text-align: right;
  width: 1%;
  white-space: nowrap;
}

.users th.col-count,
.users td.col-count {
  text-align: right;
  width: 1%;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.details-link {
  display: inline-block;
  padding: 0.3rem 0.7rem;
  font-size: 0.85rem;
  text-decoration: none;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.details-link:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.cell-user {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bg);
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

.small {
  font-size: 0.82rem;
}

.footnote {
  margin-top: 1rem;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
