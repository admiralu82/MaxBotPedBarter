<script setup>
import { computed, ref } from 'vue'
import { api } from '@/api/client'
import { formatSize } from '@/utils/format'

/**
 * Создание и редактирование материала.
 *
 * Ограничение бэкенда: файл не привязывается при загрузке, поэтому порядок такой —
 * сначала POST /api/notes (создание) либо PUT /api/notes (изменение текста),
 * затем для каждого нового файла POST /api/files и POST /api/attachments.
 * Отката нет, поэтому частичный сбой не прерывает работу, а сообщает,
 * что именно не удалось.
 *
 * Удаление файла в режиме редактирования откладывается до сохранения:
 * до нажатия «Сохранить» ничего не удаляется, «Отмена» возвращает всё как было.
 */

const props = defineProps({
  groupId: { type: [Number, String], required: true },
  authorId: { type: [Number, String], required: true },
  /** Материал для редактирования; отсутствует в режиме создания. */
  note: { type: Object, default: null },
  /** Текущие вложения материала (edit-режим). */
  attachments: { type: Array, default: () => [] },
})
const emit = defineEmits(['created', 'saved', 'close'])

const isEdit = computed(() => props.note !== null)

const name = ref(props.note?.name ?? '')
const description = ref(props.note?.description ?? '')
const newFiles = ref([])
const existingFiles = ref([...props.attachments])
const removedIds = ref([])
const submitting = ref(false)
const error = ref('')

const canSubmit = computed(() => name.value.trim().length > 0 && !submitting.value)

const totalNewSize = computed(() =>
  newFiles.value.reduce((sum, item) => sum + (item.file?.size || 0), 0),
)

function addFiles(event) {
  const selected = Array.from(event.target.files || []).map((file) => ({
    key: `${file.name}_${file.size}_${file.lastModified}_${Math.random().toString(36).slice(2, 8)}`,
    file,
    note: '',
  }))
  newFiles.value = [...newFiles.value, ...selected]
  event.target.value = ''
}

function removeNewFile(key) {
  newFiles.value = newFiles.value.filter((item) => item.key !== key)
}

/** Помечает существующий файл на удаление; повторный клик отменяет пометку. */
function toggleExisting(fileId) {
  removedIds.value = removedIds.value.includes(fileId)
    ? removedIds.value.filter((id) => id !== fileId)
    : [...removedIds.value, fileId]
}

function isMarkedRemoved(fileId) {
  return removedIds.value.includes(fileId)
}

/** Загружает файлы и прикрепляет их к материалу. Возвращает список ошибок. */
async function uploadAndAttach(noteId) {
  const failed = []

  for (const item of newFiles.value) {
    try {
      const uploaded = await api.uploadFile(item.file, item.note.trim())
      await api.attachFile(noteId, uploaded.file_id)
    } catch (err) {
      failed.push(`${item.file.name} (${err.message})`)
    }
  }

  return failed
}

async function submit() {
  if (!canSubmit.value) return

  submitting.value = true
  error.value = ''

  try {
    if (isEdit.value) {
      await submitEdit()
    } else {
      await submitCreate()
    }
  } finally {
    submitting.value = false
  }
}

async function submitCreate() {
  let note = null
  try {
    note = await api.createNote({
      group_id: Number(props.groupId),
      user_id: Number(props.authorId),
      name: name.value.trim(),
      description: description.value.trim() || null,
    })
  } catch (err) {
    error.value = err.message
    return
  }

  const failed = await uploadAndAttach(note.note_id)
  emit('created', note)

  if (failed.length) {
    error.value =
      `Материал создан, но не все файлы прикрепились: ${failed.join('; ')}. ` +
      'Закройте окно и проверьте список материалов.'
    return
  }

  emit('close')
}

async function submitEdit() {
  const noteId = props.note.note_id
  const problems = []

  try {
    await api.updateNote(noteId, {
      name: name.value.trim(),
      description: description.value.trim() || null,
    })
  } catch (err) {
    error.value = `Не удалось сохранить изменения: ${err.message}`
    return
  }

  for (const fileId of removedIds.value) {
    try {
      await api.deleteFile(fileId)
    } catch (err) {
      problems.push(`не удалён файл (${err.message})`)
    }
  }

  problems.push(...(await uploadAndAttach(noteId)))

  emit('saved', { note_id: noteId })

  if (problems.length) {
    error.value = `Изменения сохранены не полностью: ${problems.join('; ')}.`
    return
  }

  emit('close')
}
</script>

<template>
  <form @submit.prevent="submit">
    <p v-if="error" class="error-box">{{ error }}</p>

    <div class="field">
      <label for="note-name">Название</label>
      <input id="note-name" v-model="name" type="text" maxlength="200" />
    </div>

    <div class="field">
      <label for="note-description">Описание</label>
      <textarea id="note-description" v-model="description" rows="3" />
    </div>

    <div v-if="isEdit && existingFiles.length" class="field">
      <label>Файлы материала</label>
      <ul class="file-list">
        <li
          v-for="file in existingFiles"
          :key="file.file_id"
          class="file-item"
          :class="{ removed: isMarkedRemoved(file.file_id) }"
        >
          <div class="file-row">
            <span class="file-name" :title="file.name">{{ file.name }}</span>
            <span class="muted small">{{ formatSize(file.size) }}</span>
            <button class="ghost" type="button" @click="toggleExisting(file.file_id)">
              {{ isMarkedRemoved(file.file_id) ? 'Оставить' : 'Удалить' }}
            </button>
          </div>
          <span v-if="file.note" class="muted small">{{ file.note }}</span>
          <span v-if="isMarkedRemoved(file.file_id)" class="muted small removed-hint">
            Будет удалён после сохранения
          </span>
        </li>
      </ul>
    </div>

    <div class="field">
      <label>{{ isEdit ? 'Добавить файлы' : 'Файлы' }}</label>
      <input type="file" multiple @change="addFiles" />

      <p v-if="!newFiles.length" class="muted small">
        {{ isEdit ? 'Новые файлы не выбраны.' : 'Файлы не выбраны.' }}
      </p>

      <ul v-else class="file-list">
        <li v-for="item in newFiles" :key="item.key" class="file-item">
          <div class="file-row">
            <span class="file-name" :title="item.file.name">{{ item.file.name }}</span>
            <span class="muted small">{{ formatSize(item.file.size) }}</span>
            <button class="ghost" type="button" @click="removeNewFile(item.key)">Убрать</button>
          </div>
          <input v-model="item.note" type="text" placeholder="Примечание к файлу" />
        </li>
      </ul>

      <p v-if="newFiles.length" class="muted small">
        К загрузке: {{ newFiles.length }} — {{ formatSize(totalNewSize) }}
      </p>
    </div>

    <footer class="actions">
      <button class="secondary" type="button" :disabled="submitting" @click="emit('close')">
        Отмена
      </button>
      <button type="submit" :disabled="!canSubmit">
        {{ submitting ? 'Сохраняем…' : isEdit ? 'Сохранить' : 'Создать материал' }}
      </button>
    </footer>
  </form>
</template>

<style scoped>
.small {
  font-size: 0.82rem;
}

.file-list {
  list-style: none;
  margin: 0.6rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.file-item {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.5rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.file-item.removed {
  border-color: rgba(211, 63, 63, 0.45);
  background: rgba(211, 63, 63, 0.05);
}

.file-item.removed .file-name {
  text-decoration: line-through;
  color: var(--text-muted);
}

.removed-hint {
  color: var(--danger);
}

.file-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.25rem;
}
</style>
