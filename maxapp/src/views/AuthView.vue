<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/auth/useAuth'
import { ApiError } from '@/api/client'

// const BOT_USERNAME = process.env.BOT_USERNAME

const route = useRoute()
const router = useRouter()
const { login, initData, currentUserId } = useAuth()

const error = ref('')
const exchanging = ref(false)

/** Ссылка на бота: авторизация инициируется в MAX, оттуда придёт code. */
// const botUrl = BOT_USERNAME ? `https://max.ru/${BOT_USERNAME}?startapp=auth` : ''
const botUrl = '/app/auth/redirect'

async function exchange(code) {
  exchanging.value = true
  error.value = ''
  try {
    await login(code)
    // Код одноразовый — убираем его из адресной строки, чтобы F5 не пытался обменять повторно.
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null
    await router.replace(redirect || { name: 'groups' })
  } catch (err) {
    error.value =
      err instanceof ApiError && err.status === 401
        ? 'Код авторизации недействителен или истёк. Запросите новую ссылку у бота.'
        : err.message || 'Не удалось авторизоваться'
    await router.replace({ name: 'auth' })
  } finally {
    exchanging.value = false
  }
}

onMounted(() => {
  const code = typeof route.query.code === 'string' ? route.query.code : ''
  if (code) {
    exchange(code)
  }
})
</script>

<template>
  <div class="auth-screen">
    <div class="auth-card">
      <h1>Материалы MAX</h1>
      <p class="muted">Для доступа к материалам нужна авторизация через бота.</p>
      <p class="muted">initData: {{ initData }}</p>
      <p class="muted">currentUserId: {{ currentUserId }}</p>

      <p v-if="error" class="error-box">{{ error }}</p>

      <p v-if="exchanging" class="muted">Проверяем код авторизации…</p>
      <a v-else="botUrl" class="auth-button" :href="botUrl">АВТОРИЗАЦИЯ</a>

      <p class="hint muted">
        Бот пришлёт ссылку для возврата на сайт. После неё страница откроется автоматически.
      </p>
    </div>
  </div>
</template>

<style scoped>
.auth-screen {
  display: flex;
  justify-content: center;
  padding-top: 12vh;
}

.auth-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 2rem;
  max-width: 380px;
  width: 100%;
  text-align: center;
}

.auth-card h1 {
  margin-bottom: 0.5rem;
}

.auth-button {
  display: block;
  margin: 1.5rem 0 1rem;
  padding: 0.75rem 1rem;
  background: var(--accent);
  color: #fff;
  text-decoration: none;
  border-radius: var(--radius);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.auth-button:hover {
  background: var(--accent-hover);
}

.hint {
  font-size: 0.85rem;
  margin-bottom: 0;
}
</style>
