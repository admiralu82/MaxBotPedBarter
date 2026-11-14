<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api/client'
import { useAuth } from '@/auth/useAuth'
import BaseModal from '@/components/BaseModal.vue'
import NoteForm from '@/components/NoteForm.vue'
import NoteCard from '@/components/NoteCard.vue'
import { displayUserName } from '@/utils/user'

/**
 * Профиль пользователя.
 *
 * Просматривать может любой авторизованный; смена статуса администратора
 * доступна только админам (/api/users PUT проверяет это же на сервере).
 */

const route = useRoute()
const router = useRouter()
const { user: me, isAdmin } = useAuth()

const userId = computed(() => {
  const value = Number(route.params.id)
  return Number.isFinite(value) && value > 0 ? value : null
})

const profile = ref(null)
const groups = ref([])
const notes = ref([])
const attachments = ref({})
const loading = ref(true)
const loadError = ref('')

const editingNote = ref(null)
const deletingNote = ref(null)
const deleting = ref(false)
const deleteError = ref('')

const savingAdmin = ref(false)
const adminError = ref('')

const isSelf = computed(() => userId.value === me.value?.user_id)
const profileIsAdmin = computed(
  () => profile.value?.is_admin === 1 || profile.value?.is_admin === true,
)

/** Заголовок своего профиля: id — это и есть текущий пользователь. */
const pageTitle = computed(() => {
  if (!profile.value) return 'Пользователь'
  return displayUserName(profile.value)
})

function groupName(groupId) {
  return groups.value.find((g) => g.group_id === groupId)?.name || `Группа ${groupId}`
}

/** Материалы, сгруппированные по группам, в порядке появления в списке. */
const groupedNotes = computed(() => {
  const map = new Map()
  for (const note of notes.value) {
    if (!map.has(note.group_id)) {
      map.set(note.group_id, { group_id: note.group_id, name: groupName(note.group_id), notes: [] })
    }
    map.get(note.group_id).notes.push(note)
  }
  return [...map.values()]
})

async function loadGroups() {
  try {
    groups.value = (await api.listGroups()) || []
  } catch {
    groups.value = []
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

async function loadProfile() {
  if (!userId.value) {
    loading.value = false
    loadError.value = 'Некорректный идентификатор пользователя'
    return
  }

  loading.value = true
  loadError.value = ''
  try {
    profile.value = await api.getUser(userId.value)

    // Материалы пользователя: у бэкенда нет фильтра по автору и группе одновременно,
    // поэтому берём всё по user_id и группируем на клиенте.
    notes.value = (await api.listNotesByUser(userId.value)) || []
    await loadAttachments()
  } catch (error) {
    loadError.value = error.message
    profile.value = null
    notes.value = []
    attachments.value = {}
  } finally {
    loading.value = false
  }
}

async function toggleAdmin() {
  if (!isAdmin.value || isSelf.value) return

  savingAdmin.value = true
  adminError.value = ''
  try {
    profile.value = await api.updateUser(userId.value, {
      is_admin: profileIsAdmin.value ? 0 : 1,
    })
  } catch (error) {
    adminError.value = error.message
  } finally {
    savingAdmin.value = false
  }
}

function startEdit(note) {
  editingNote.value = note
}

async function onSaved() {
  await loadProfile()
}

function startDelete(note) {
  deletingNote.value = note
  deleteError.value = ''
}

async function confirmDelete() {
  if (!deletingNote.value) return

  deleting.value = true
  deleteError.value = ''
  try {
    await api.deleteNote(deletingNote.value.note_id)
    deletingNote.value = null
    await loadProfile()
  } catch (error) {
    deleteError.value = error.message
  } finally {
    deleting.value = false
  }
}

function goBack() {
  router.push(isAdmin.value ? { name: 'users' } : { name: 'groups' })
}

watch(userId, () => {
  editingNote.value = null
  deletingNote.value = null
  loadProfile()
})

onMounted(async () => {
  await loadGroups()
  await loadProfile()
})
</script>

<template>
  <section>
    <nav class="breadcrumbs">
      <button class="ghost" type="button" @click="goBack">
        ← {{ isAdmin ? 'Все пользователи' : 'Все группы' }}
      </button>
    </nav>

    <p v-if="loadError" class="error-box">{{ loadError }}</p>
    <p v-if="loading" class="muted">Загрузка…</p>

    <template v-else-if="profile">
      <header class="profile">
        <img
          v-if="profile.avatar_url"
          :src="profile.avatar_url"
          :alt="pageTitle"
          class="avatar"
        />
        <div class="profile-main">
          <div class="profile-title">
            <h1>{{ pageTitle }}</h1>
            <span v-if="profileIsAdmin" class="badge">админ</span>
            <span v-if="isSelf" class="badge badge-self">это вы</span>
          </div>

          <dl class="profile-fields">
            <div>
              <dt>Логин</dt>
              <dd>{{ profile.username || '—' }}</dd>
            </div>
            <div>
              <dt>Телефон</dt>
              <dd>{{ profile.phone || '—' }}</dd>
            </div>
            <div>
              <dt>ID</dt>
              <dd>{{ profile.user_id }}</dd>
            </div>
            <div>
              <dt>Материалов</dt>
              <dd>{{ notes.length }}</dd>
            </div>
          </dl>

          <p v-if="adminError" class="error-box">{{ adminError }}</p>

          <div v-if="isAdmin && !isSelf" class="admin-control">
            <button
              class="secondary"
              type="button"
              :disabled="savingAdmin"
              @click="toggleAdmin"
            >
              {{ savingAdmin ? 'Сохраняем…' : profileIsAdmin ? 'Снять права админа' : 'Сделать админом' }}
            </button>
          </div>

          <p v-else-if="isAdmin && isSelf" class="muted small">
            Свой статус администратора изменить нельзя.
          </p>
        </div>
      </header>

      <h2 class="section-title">Материалы по группам</h2>

      <p v-if="!notes.length" class="empty">У пользователя пока нет материалов.</p>

      <div v-else class="group-block" v-for="block in groupedNotes" :key="block.group_id">
        <h3 class="group-title">{{ block.name }}</h3>
        <ul class="note-list">
          <li v-for="note in block.notes" :key="note.note_id">
            <NoteCard
              :note="note"
              :files="attachments[note.note_id] || []"
              @edit="startEdit"
              @delete="startDelete"
            />
          </li>
        </ul>
      </div>
    </template>

    <BaseModal v-if="editingNote" title="Редактирование материала" @close="editingNote = null">
      <NoteForm
        :group-id="editingNote.group_id"
        :author-id="editingNote.user_id"
        :note="editingNote"
        :attachments="attachments[editingNote.note_id] || []"
        @saved="onSaved"
        @close="editingNote = null"
      />
    </BaseModal>

    <BaseModal v-if="deletingNote" title="Удалить материал?" @close="deletingNote = null">
      <p v-if="deleteError" class="error-box">{{ deleteError }}</p>
      <p>
        Материал «{{ deletingNote.name }}» будет удалён вместе с файлами, которые
        прикреплены только к нему. Действие необратимо.
      </p>

      <template #footer>
        <button class="secondary" type="button" :disabled="deleting" @click="deletingNote = null">
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
  margin-bottom: 0.75rem;
}

.profile {
  display: flex;
  gap: 1.25rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem;
}

.avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bg);
  flex-shrink: 0;
}

.profile-main {
  flex: 1;
  min-width: 0;
}

.profile-title {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.profile-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.75rem;
  margin: 0 0 0.75rem;
}

.profile-fields dt {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
}

.profile-fields dd {
  margin: 0.15rem 0 0;
  word-break: break-word;
}

.admin-control {
  margin-top: 0.5rem;
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

.badge-self {
  background: rgba(47, 111, 237, 0.05);
  color: var(--text-muted);
}

.section-title {
  margin: 1.75rem 0 1rem;
}

.group-block + .group-block {
  margin-top: 1.5rem;
}

.group-title {
  font-size: 1rem;
  color: var(--text-muted);
  margin-bottom: 0.6rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--border);
}

.note-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.small {
  font-size: 0.82rem;
}
</style>
