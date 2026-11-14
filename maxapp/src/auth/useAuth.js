import { computed, ref, onMounted, onUnmounted } from 'vue'
import { api, ApiError } from '@/api/client'


/**
 * Состояние авторизации.
 *
 * Источник правды — GET /api/auth/me (JWT в httpOnly cookie).
 * Бэкенд дополнительно кладёт копию профиля в cookie USER_INFO (не httpOnly),
 * её читаем при старте, чтобы не мигать экраном авторизации до ответа /auth/me.
 */

const USER_INFO_COOKIE = 'USER_INFO'

const token = ref(false)
const user = ref(readUserInfoCookie())
const checked = ref(false)
const loading = ref(false)
const initData = ref(null)       // инициализация через window.WebApp.initDataUnsafe, если мы в MAX
const currentUserId = ref(null)   // признак что мы работаем в MAX, инициализация через initDataUnsafe.user.id

function readUserInfoCookie() {
  const raw = document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${USER_INFO_COOKIE}=`))
  if (!raw) return null

  try {
    return JSON.parse(decodeURIComponent(raw.slice(USER_INFO_COOKIE.length + 1)))
  } catch {
    return null
  }
}

function isAdminValue(value) {
  // Бэкенд отдаёт is_admin как 0/1, но не полагаемся на конкретный тип.
  return value === 1 || value === true || value === '1'
}

/** Проверка сессии; 401 — нормальный результат, а не ошибка. */
async function fetchMe() {
  loading.value = true
  try {

    if (!!initData.value) {
      let data = await api.authMax(initData.value);
      console.log('fetchMe: authMax result', data)
      let tokenGet = data?.token ?? false;
      if (!tokenGet) {
        console.error('[AUTHMAX] Не удалось получить токен из initData:', data)
      } else {
        token.value = tokenGet;
      }
      delete data.token;

      user.value = data;
    } else {
      let out = await api.authMe()
      console.log('fetchMe: authMe result', out)
      user.value = out
    }
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      console.error('[AUTH] Не удалось проверить сессию:', error)
    }
    // Бэкенд чистит USER_INFO при 401, но cookie могла остаться от прошлой сессии.
    user.value = null
  } finally {
    checked.value = true
    loading.value = false
  }
  return user.value
}

/** Обмен кода из ссылки бота на JWT. */
async function login(code) {
  user.value = await api.authExchange(code)
  checked.value = true
  return user.value
}

export function useAuth() {

  onMounted(() => {
    const webApp = window?.WebApp ?? null;

    if (webApp && webApp.initDataUnsafe && webApp.initDataUnsafe.user) {
      currentUserId.value = webApp.initDataUnsafe.user.id;
      initData.value = webApp.initDataUnsafe;

      // window.WebApp.requestContact().then(data => {
      //   console.log(`Номер телефона пользователя ${data.phone}`)
      //   console.log('Данные', data)
      // }).catch(error => {
      //   console.error('Ошибка при запросе контакта:', error)
      // });
    }

  })


  return {
    initData,currentUserId,token, // поля для работы с MAX
    user,
    checked,
    loading,
    isAuthenticated: computed(() => user.value !== null),
    isAdmin: computed(() => isAdminValue(user.value?.is_admin)),
    fetchMe,
    login,
  }
}
