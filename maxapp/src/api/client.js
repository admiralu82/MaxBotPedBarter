/**
 * Тонкий HTTP-клиент поверх /api.
 * Ошибки приводятся к { status, message } — тексты бэкенда на английском,
 * поэтому для известных кодов подставляем русские сообщения.
 */

import { useAuth } from '@/auth/useAuth.js'

const BASE = '/api'

const STATUS_MESSAGES = {
  400: 'Некорректный запрос',
  401: 'Требуется авторизация',
  403: 'Недостаточно прав',
  404: 'Не найдено',
  500: 'Ошибка сервера',
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function parseBody(res) {
  const type = res.headers.get('Content-Type') || ''
  if (!type.includes('application/json')) {
    return null
  }
  try {
    return await res.json()
  } catch {
    return null
  }
}

async function request(path, { method = 'GET', body, isForm = false, query } = {}) {
  const options = { method, credentials: 'same-origin' }

  if (query) {
    const queryString = new URLSearchParams(query).toString()
    path += `?${queryString}`
  }

  if (body !== undefined) {
    if (isForm) {
      options.body = body
    } else {
      options.headers = { 'Content-Type': 'application/json' }
      options.body = JSON.stringify(body)
    }
  }

  const { token } = useAuth()
  if (token.value) {
    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${token.value}`,
    }
  }

  let res
  try {
    res = await fetch(`${BASE}${path}`, options)
  } catch {
    throw new ApiError(0, 'Нет связи с сервером')
  }

  const data = await parseBody(res)

  if (!res.ok) {
    const message = data?.error
      ? STATUS_MESSAGES[res.status] || data.error
      : STATUS_MESSAGES[res.status] || `Ошибка ${res.status}`
    throw new ApiError(res.status, message)
  }

  return data
}

export const api = {
  // --- Авторизация ---
  authMax: (data) => request('/auth/max', { method: 'POST', body: data }),
  /** Текущий пользователь из cookie; 401 — сессии нет. */
  authMe: (query) => request('/auth/me', { method: 'GET', query: query ? query : undefined }),
  /** Обмен одноразового кода на JWT (cookie ставит бэкенд). */
  authExchange: (code) => request('/auth/exchange', { method: 'POST', body: { code } }),
  /** Отправить сообщение сотруднику. */
  sendMessage: (fromId, toId, message) =>
    request('/sendmsg', { method: 'POST', body: { from_id: fromId, to_id: toId, message } }),

  // --- Группы ---
  listGroups: () => request('/groups'),
  createGroup: (group) => request('/groups', { method: 'POST', body: group }),

  // --- Пользователи ---
  listUsers: () => request('/users'),
  getUser: (userId) => request(`/users?user_id=${encodeURIComponent(userId)}`),
  /** Частичное обновление. `is_admin` принимает только администратор. */
  updateUser: (userId, patch) =>
    request(`/users?user_id=${encodeURIComponent(userId)}`, { method: 'PUT', body: patch }),

  // --- Материалы ---
  listNotes: (groupId) => request(`/notes?group_id=${encodeURIComponent(groupId)}`),
  listNotesByUser: (userId) => request(`/notes?user_id=${encodeURIComponent(userId)}`),
  createNote: (note) => request('/notes', { method: 'POST', body: note }),
  /** Изменить материал. Доступно автору и админу; `user_id` изменить нельзя. */
  updateNote: (noteId, note) =>
    request(`/notes?note_id=${encodeURIComponent(noteId)}`, { method: 'PUT', body: note }),
  /** Удалить материал вместе с его вложениями и осиротевшими файлами. */
  deleteNote: (noteId) =>
    request(`/notes?note_id=${encodeURIComponent(noteId)}`, { method: 'DELETE' }),

  // --- Файлы и вложения ---
  /** Загрузка файла (multipart/form-data: file + note). */
  uploadFile: (file, note) => {
    const form = new FormData()
    form.append('file', file)
    if (note) {
      form.append('note', note)
    }
    return request('/files', { method: 'POST', body: form, isForm: true })
  },
  /** Прикрепить файл к материалу. */
  attachFile: (noteId, fileId) =>
    request(
      `/attachments?note_id=${encodeURIComponent(noteId)}&file_id=${encodeURIComponent(fileId)}`,
      { method: 'POST' },
    ),
  /** Открепить файл от материала (сам файл остаётся). */
  detachFile: (noteId, fileId) =>
    request(
      `/attachments?note_id=${encodeURIComponent(noteId)}&file_id=${encodeURIComponent(fileId)}`,
      { method: 'DELETE' },
    ),
  /** Удалить файл целиком (с диска, из БД и из всех вложений). */
  deleteFile: (fileId) =>
    request(`/files?file_id=${encodeURIComponent(fileId)}`, { method: 'DELETE' }),
  /** Вложения материала: { note_id, note, files: [{ file_id, name, size, note }] }. */
  listAttachments: (noteId) => request(`/attachments?note_id=${encodeURIComponent(noteId)}`),
  /** Прямая ссылка на скачивание файла. */
  fileDownloadUrl: (fileId) => `${BASE}/files?file_id=${encodeURIComponent(fileId)}`,
}
