<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api/client'
import { useAuth } from '@/auth/useAuth'
import BaseModal from '@/components/BaseModal.vue'

const router = useRouter()
const { isAdmin } = useAuth()

const groups = ref([])
const loading = ref(true)
const loadError = ref('')

const showCreate = ref(false)
const creating = ref(false)
const createError = ref('')
const form = ref({ name: '', description: '' })

const canSubmit = computed(() => form.value.name.trim().length > 0)

async function loadGroups() {
  loading.value = true
  loadError.value = ''
  try {
    groups.value = (await api.listGroups()) || []
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.value = { name: '', description: '' }
  createError.value = ''
  showCreate.value = true
}

async function submitCreate() {
  if (!canSubmit.value) return

  creating.value = true
  createError.value = ''
  try {
    const group = await api.createGroup({
      name: form.value.name.trim(),
      description: form.value.description.trim() || null,
    })
    showCreate.value = false
    await loadGroups()
    return group
  } catch (error) {
    createError.value = error.message
  } finally {
    creating.value = false
  }
}

function openGroup(group) {
  router.push({ name: 'notes', query: { group_id: group.group_id } })
}

onMounted(loadGroups)
</script>

<template>
  <section>
    <header class="page-header">
      <h1>Группы</h1>
      <button v-if="isAdmin" type="button" @click="openCreate">Создать группу</button>
    </header>

    <p v-if="loadError" class="error-box">{{ loadError }}</p>
    <p v-if="loading" class="muted">Загрузка…</p>
    <p v-else-if="!groups.length && !loadError" class="empty">Групп пока нет.</p>

    <div v-else class="grid">
      <button
        v-for="group in groups"
        :key="group.group_id"
        class="card"
        type="button"
        @click="openGroup(group)"
      >
        <h2>{{ group.name }}</h2>
        <p class="description">{{ group.description || 'Описание не задано' }}</p>
        <p class="notes_count">{{ group.notes_count }} {{ group.notes_count === 1 ? 'материал' : 'материалов' }}</p>
      </button>
    </div>

    <BaseModal v-if="showCreate" title="Новая группа" @close="showCreate = false">
      <p v-if="createError" class="error-box">{{ createError }}</p>

      <div class="field">
        <label for="group-name">Название</label>
        <input id="group-name" v-model="form.name" type="text" maxlength="200" />
      </div>

      <div class="field">
        <label for="group-description">Описание</label>
        <textarea id="group-description" v-model="form.description" rows="3" />
      </div>

      <template #footer>
        <button class="secondary" type="button" @click="showCreate = false">Отмена</button>
        <button type="button" :disabled="!canSubmit || creating" @click="submitCreate">
          {{ creating ? 'Создаём…' : 'Создать' }}
        </button>
      </template>
    </BaseModal>
  </section>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}

.card {
  display: block;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.1rem;
  color: inherit;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.card:hover:not(:disabled) {
  background: var(--surface);
  border-color: var(--accent);
  box-shadow: 0 6px 18px rgba(47, 111, 237, 0.14);
  transform: translateY(-1px);
}

.card h2 {
  margin-bottom: 0.4rem;
}

.description {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}
.notes_count {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0.65rem 0 0;
  border-top: 1px dashed var(--border);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
}
</style>
