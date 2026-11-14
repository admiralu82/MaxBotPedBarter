import { reactive } from 'vue'

/** Сколько последних страниц держим в меню. */
const MAX_ENTRIES = 3

const TITLES = {
  groups: 'Кафедры',
  notes: 'Материалы',
  users: 'Пользователи',
  user: 'Профиль',
  helpme: 'Помощь',
}

/** Последние посещённые страницы; последняя — текущая. */
export const navHistory = reactive({ entries: [] })

function labelFor(route) {
  let label = TITLES[route.name] || route.name || route.path

  if (route.name === 'notes' && route.query.group_id) {
    label += ` #${route.query.group_id}`
  } else if (route.name === 'user' && route.params.id) {
    label += ` #${route.params.id}`
  }

  return label
}

export function recordVisit(route) {
  // Экран входа в историю навигации не попадает.
  if (!route || !route.name || route.name === 'auth') return

  const path = route.fullPath
  const existing = navHistory.entries.findIndex((entry) => entry.path === path)
  if (existing !== -1) {
    navHistory.entries.splice(existing, 1)
  }

  navHistory.entries.push({ path, label: labelFor(route) })

  if (navHistory.entries.length > MAX_ENTRIES) {
    navHistory.entries.splice(0, navHistory.entries.length - MAX_ENTRIES)
  }
}
