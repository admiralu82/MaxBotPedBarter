<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '@/api/client'
import { useAuth } from '@/auth/useAuth'
import { formatSize } from '@/utils/format'
import { displayUserName, noteAuthor } from '@/utils/user'

/**
 * Карточка материала. Менять и удалять может автор материала или администратор;
 * остальные видят только текст и ссылки на файлы.
 */

const props = defineProps({
  note: { type: Object, required: true },
  files: { type: Array, default: () => [] },
})
const emit = defineEmits(['edit', 'delete'])

const { user, isAdmin } = useAuth()

const canEdit = computed(
  () => isAdmin.value || props.note.user_id === user.value?.user_id,
)

/** Автор приходит из JOIN в GET /api/notes; может отсутствовать, если запись пользователя удалена. */
const author = computed(() => noteAuthor(props.note))
const authorName = computed(() => displayUserName(author.value))
</script>

<template>
  <article class="note">
    <div class="note-header">
      <h2>{{ note.name }}</h2>

      <div v-if="canEdit" class="note-actions">
        <button class="secondary" type="button" @click="emit('edit', note)">Изменить</button>
        <button class="danger" type="button" @click="emit('delete', note)">Удалить</button>
      </div>
    </div>

    <RouterLink
      v-if="author"
      class="author"
      :to="{ name: 'user', params: { id: author.user_id } }"
      :title="authorName"
    >
      <img v-if="author.avatar_url" :src="author.avatar_url" :alt="authorName" class="author-avatar" />
      <span v-else class="author-avatar author-avatar-fallback" aria-hidden="true">
        {{ authorName.charAt(0).toUpperCase() }}
      </span>
      <span class="author-name">{{ authorName }}</span>
    </RouterLink>

    <p v-if="note.description" class="description">{{ note.description }}</p>
    <p v-else class="description muted">Описание не задано</p>

    <ul v-if="files.length" class="files">
      <li v-for="file in files" :key="file.file_id">
        <a :href="api.fileDownloadUrl(file.file_id)" target="_blank" rel="noopener">
          {{ file.name }}
        </a>
        <span class="muted">— {{ formatSize(file.size) }}</span>
        <span v-if="file.note" class="muted"> · {{ file.note }}</span>
      </li>
    </ul>
  </article>
</template>

<style scoped>
.note {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.1rem;
}

.note-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.35rem;
}

.note-header h2 {
  margin-bottom: 0;
}

.note-actions {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
}

.note-actions button {
  padding: 0.3rem 0.7rem;
  font-size: 0.85rem;
}

.author {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  text-decoration: none;
  max-width: 100%;
}

.author:hover .author-name {
  color: var(--accent);
  text-decoration: underline;
}

.author-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bg);
  flex-shrink: 0;
}

.author-avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--accent);
  background: rgba(47, 111, 237, 0.12);
}

.author-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.description {
  margin: 0;
  white-space: pre-wrap;
}

.files {
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

