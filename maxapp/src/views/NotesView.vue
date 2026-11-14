<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api/client'
import { useAuth } from '@/auth/useAuth'
import BaseModal from '@/components/BaseModal.vue'
import NoteForm from '@/components/NoteForm.vue'
import NoteCard from '@/components/NoteCard.vue'

const route = useRoute()
const router = useRouter()
const { user } = useAuth()

const groupId = computed(() => {
  const value = Number(route.query.group_id)
  return Number.isFinite(value) && value > 0 ? value : null
})

const group = ref(null)
const notes = ref([])
const attachments = ref({})
const loading = ref(true)
const loadError = ref('')
const searchQuery = ref('')

const filteredNotes = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return notes.value
  return notes.value.filter((note) => {
    const name = (note.name || '').toLowerCase()
    const description = (note.description || '').toLowerCase()
    return name.includes(query) || description.includes(query)
  })
})

const showCreate = ref(false)
const editingNote = ref(null)
const deletingNote = ref(null)
const deleting = ref(false)
const deleteError = ref('')

async function loadGroup() {
  if (!groupId.value) return
  try {
    const groups = (await api.listGroups()) || []
    group.value = groups.find((item) => item.group_id === groupId.value) || null
  } catch {
    group.value = null
  }
}

async function loadAttachments() {
  const results = await Promise.allSettled(
    notes.value.map((note) => api.listAttachments(note.note_id)),
  )
  const map = {}
  results.forEach((result, index) => {
    map[notes.value[index].note_id] = result.status === 'fulfilled' ? result.value?.files || [] : []
  })
  attachments.value = map
}

async function loadNotes() {
  if (!groupId.value) {
    loading.value = false
    return
  }

  loading.value = true
  loadError.value = ''
  try {
    notes.value = (await api.listNotes(groupId.value)) || []
    await loadAttachments()
  } catch (error) {
    loadError.value = error.message
    notes.value = []
    attachments.value = {}
  } finally {
    loading.value = false
  }
}

function openGroupList() {
  router.push({ name: 'groups' })
}

function openHelpMe() {
  router.push({ name: 'helpme', query: { group_id: groupId.value } })
}

function onSaved() {
  loadNotes()
}

function startEdit(note) {
  editingNote.value = note
}

function closeEdit() {
  editingNote.value = null
}

function startDelete(note) {
  deletingNote.value = note
  deleteError.value = ''
}

function cancelDelete() {
  deletingNote.value = null
  deleteError.value = ''
}

async function confirmDelete() {
  if (!deletingNote.value) return

  deleting.value = true
  deleteError.value = ''
  try {
    // Бэкенд удаляет и вложения, и осиротевшие файлы
    await api.deleteNote(deletingNote.value.note_id)
    deletingNote.value = null
    await loadNotes()
  } catch (error) {
    deleteError.value = error.message
  } finally {
    deleting.value = false
  }
}

watch(groupId, () => {
  editingNote.value = null
  deletingNote.value = null
  searchQuery.value = ''
  loadGroup()
  loadNotes()
})

onMounted(() => {
  if (!groupId.value) {
    loading.value = false
    return
  }
  loadGroup()
  loadNotes()
})
</script>

<template>
  <section>
    <nav class="breadcrumbs">
      <button class="ghost" type="button" @click="openGroupList">← Все группы</button>
    </nav>

    <header class="page-header">
      <div>
        <h1>{{ group?.name || 'Материалы группы' }}</h1>
        <p v-if="group?.description" class="muted">{{ group.description }}</p>
      </div>
      <button v-if="groupId" type="button" @click="showCreate = true">Создать материал</button>
    </header>

    <p v-if="!groupId" class="error-box">
      Группа не выбрана. Вернитесь к списку групп и выберите нужную.
    </p>

    <p v-if="loadError" class="error-box">{{ loadError }}</p>

    <div v-if="groupId" class="search-row">
      <input
        v-model="searchQuery"
        type="search"
        placeholder="Поиск по названию или описанию…"
        aria-label="Поиск материалов"
      />
      <button class="help-button" type="button" @click="openHelpMe">
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M2 15V7h10.5v8" />
          <path d="M12.5 10H16l3.5 3.5V15h-2" />
          <circle cx="6.5" cy="17" r="2" />
          <circle cx="17" cy="17" r="2" />
          <path d="M8.5 17h5" />
          <path d="M6 9.5v2.5M4.75 10.75h2.5" />
        </svg>
        Прошу помощи
      </button>
    </div>

    <p v-if="loading" class="muted">Загрузка…</p>
    <p v-else-if="groupId && !notes.length && !loadError" class="empty">
      В этой группе пока нет материалов.
    </p>
    <p v-else-if="groupId && !filteredNotes.length && !loadError" class="empty">
      По запросу «{{ searchQuery.trim() }}» ничего не найдено.
    </p>

    <ul v-else-if="filteredNotes.length" class="note-list">
      <li v-for="note in filteredNotes" :key="note.note_id">
        <NoteCard
          :note="note"
          :files="attachments[note.note_id] || []"
          @edit="startEdit"
          @delete="startDelete"
        />
      </li>
    </ul>

    <BaseModal v-if="showCreate" title="Новый материал" @close="showCreate = false">
      <NoteForm
        :group-id="groupId"
        :author-id="user.user_id"
        @created="onSaved"
        @close="showCreate = false"
      />
    </BaseModal>

    <BaseModal v-if="editingNote" title="Редактирование материала" @close="closeEdit">
      <NoteForm
        :group-id="groupId"
        :author-id="editingNote.user_id"
        :note="editingNote"
        :attachments="attachments[editingNote.note_id] || []"
        @saved="onSaved"
        @close="closeEdit"
      />
    </BaseModal>

    <BaseModal v-if="deletingNote" title="Удалить материал?" @close="cancelDelete">
      <p v-if="deleteError" class="error-box">{{ deleteError }}</p>

      <p>
        Материал «{{ deletingNote.name }}» будет удалён вместе с файлами, которые
        прикреплены только к нему. Действие необратимо.
      </p>

      <template #footer>
        <button class="secondary" type="button" :disabled="deleting" @click="cancelDelete">
          Отмена
        </button>
        <button class="danger-solid" type="button" :disabled="deleting" @click="confirmDelete">
          {{ deleting ? 'Удаляем…' : 'Удалить' }}
        </button>
      </template>
    </BaseModal>
  </section>
</template>

<style scoped>
.breadcrumbs {
  margin-bottom: 0.5rem;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.page-header p {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
}

.note-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1rem;
}

.search-row input {
  flex: 1;
  min-width: 0;
}

.help-button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
  white-space: nowrap;
}
</style>
