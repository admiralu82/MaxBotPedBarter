<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { api } from '@/api/client'
import { useAuth } from '@/auth/useAuth'
import BaseModal from '@/components/BaseModal.vue'
import { displayUserName, noteAuthor } from '@/utils/user'

/**
 * Самые активные участники группы.
 *
 * Отдельного API состава группы нет, поэтому участники выводятся из авторов
 * материалов группы: количество участников — число уникальных авторов,
 * активность — число материалов, добавленных в эту группу.
 */

const route = useRoute()
const router = useRouter()
const { user: me } = useAuth()

const groupId = computed(() => {
  const value = Number(route.query.group_id)
  return Number.isFinite(value) && value > 0 ? value : null
})

const group = ref(null)
const notes = ref([])
const loading = ref(true)
const loadError = ref('')

const TOP_LIMIT = 6

const messagingUser = ref(null)
const messageText = ref('')
const sending = ref(false)
const sendError = ref('')
const sent = ref(false)

const canSend = computed(() => messageText.value.trim().length > 0 && !sending.value)

const participants = computed(() => {
  const map = new Map()

  for (const note of notes.value) {
    const author = noteAuthor(note)
    const userId = note.user_id

    if (!author || !userId) continue

    if (!map.has(userId)) {
      map.set(userId, { user: author, count: 0 })
    }
    map.get(userId).count += 1
  }

  return [...map.values()].sort((a, b) => b.count - a.count)
})

const topParticipants = ref([])

const participantsText = computed(() => {
  const total = participants.value.length
  const mod10 = total % 10
  const mod100 = total % 100
  let word = 'участников'
  if (mod10 === 1 && mod100 !== 11) word = 'участник'
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = 'участника'
  return `В группе «${group.value?.name || 'Материалы группы'}» состоит ${total} ${word}.`
})

async function loadData() {
  if (!groupId.value) {
    loading.value = false
    loadError.value = 'Группа не выбрана.'
    return
  }

  loading.value = true
  loadError.value = ''
  try {
    const [groups, groupNotes] = await Promise.all([
      api.listGroups(),
      api.listNotes(groupId.value),
    ])
    group.value = (groups || []).find((item) => item.group_id === groupId.value) || null
    notes.value = groupNotes || []

    // У авторов материалов нет телефона — догружаем профили только для топ-6.
    topParticipants.value = participants.value.slice(0, TOP_LIMIT).map((item) => ({ ...item }))
    const enriched = await Promise.allSettled(
      topParticipants.value.map((item) => api.getUser(item.user.user_id)),
    )
    enriched.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        const item = topParticipants.value[index]
        item.user = { ...item.user, ...result.value }
      }
    })
  } catch (error) {
    loadError.value = error.message
    group.value = null
    notes.value = []
    topParticipants.value = []
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({ name: 'notes', query: { group_id: groupId.value } })
}

function openMessage(user) {
  messagingUser.value = user
  messageText.value = ''
  sendError.value = ''
  sent.value = false
}

function closeMessage() {
  if (sending.value) return
  messagingUser.value = null
}

async function sendMessage() {
  if (!canSend.value) return

  const fromId = me.value?.user_id
  if (!fromId) {
    sendError.value = 'Не удалось определить отправителя.'
    return
  }

  sending.value = true
  sendError.value = ''
  try {
    await api.sendMessage(fromId, messagingUser.value.user_id, messageText.value.trim())
    sent.value = true
  } catch (error) {
    sendError.value = error.message
  } finally {
    sending.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <nav class="breadcrumbs">
      <button class="ghost" type="button" @click="goBack">← К материалам группы</button>
    </nav>

    <header class="page-header">
      <h1>Прошу помощи</h1>
    </header>

    <p v-if="loadError" class="error-box">{{ loadError }}</p>
    <p v-else-if="loading" class="muted">Загрузка…</p>

    <template v-else>
      <p class="summary">{{ participantsText }}</p>

      <template v-if="topParticipants.length">
        <p class="muted">Ниже приведены самые активные.</p>

        <ul class="participants">
          <li v-for="item in topParticipants" :key="item.user.user_id">
            <div class="participant">
              <RouterLink
                class="participant-link"
                :to="{ name: 'user', params: { id: item.user.user_id } }"
                :title="displayUserName(item.user)"
              >
                <img
                  v-if="item.user.avatar_url"
                  :src="item.user.avatar_url"
                  :alt="displayUserName(item.user)"
                  class="avatar"
                />
                <span v-else class="avatar avatar-fallback" aria-hidden="true">
                  {{ displayUserName(item.user).charAt(0).toUpperCase() }}
                </span>

                <span class="participant-name">{{ displayUserName(item.user) }}</span>
                <span class="participant-phone">{{ item.user.phone || 'Телефон не указан' }}</span>
              </RouterLink>

              <button
                class="secondary message-button"
                type="button"
                @click="openMessage(item.user)"
              >
                Отправить сообщение
              </button>
            </div>
          </li>
        </ul>
      </template>

      <p v-else class="empty">В этой группе пока нет участников с материалами.</p>
    </template>

    <BaseModal
      v-if="messagingUser"
      :title="`Отправить сообщение ${displayUserName(messagingUser)}`"
      @close="closeMessage"
    >
      <template v-if="sent">
        <p class="sent-text">
          Сообщение для {{ displayUserName(messagingUser) }} отправлено.
        </p>
      </template>

      <template v-else>
        <p class="instruction">
          Отправьте коллеге сообщение с вашим контактом или другой информацией. Он получит ваше сообщение в MAX. 
        </p>
         
        <div class="instruction-picture">
          <img style="width: 40%;" src="/max.png" />
        </div>

        <p v-if="sendError" class="error-box">{{ sendError }}</p>

        <label for="message-text">Текст сообщения</label>
        <textarea
          id="message-text"
          v-model="messageText"
          rows="4"
          maxlength="1000"
          placeholder="Например: ссылку на ваш контакт в МАКС…"
        />
      </template>

      <template #footer>
        <template v-if="sent">
          <button type="button" @click="closeMessage">Закрыть</button>
        </template>
        <template v-else>
          <button class="secondary" type="button" :disabled="sending" @click="closeMessage">
            Отмена
          </button>
          <button type="button" :disabled="!canSend" @click="sendMessage">
            {{ sending ? 'Отправляем…' : 'Отправить' }}
          </button>
        </template>
      </template>
    </BaseModal>
  </section>
</template>

<style scoped>
.breadcrumbs {
  margin-bottom: 0.5rem;
}

.page-header {
  margin-bottom: 1rem;
}

.summary {
  font-size: 1.05rem;
  margin: 0 0 0.35rem;
}

.participants {
  list-style: none;
  margin: 1rem 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}

.participant {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  height: 100%;
  padding: 1.1rem 1rem;
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.participant:hover {
  border-color: var(--accent);
  box-shadow: 0 6px 18px rgba(47, 111, 237, 0.14);
  transform: translateY(-1px);
}

.participant-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  text-decoration: none;
  color: inherit;
}

.message-button {
  width: 100%;
  padding: 0.4rem 0.6rem;
  font-size: 0.85rem;
}

.avatar {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bg);
  flex-shrink: 0;
}

.avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: 600;
  color: var(--accent);
  background: rgba(47, 111, 237, 0.12);
}

.participant-name {
  font-weight: 600;
  word-break: break-word;
}

.participant-phone {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.instruction {
  margin-top: 0;
}

.instruction-picture {
  display: flex;
  justify-content: center;
  margin: 0.25rem 0 1rem;
}

.instruction-picture svg {
  width: 170px;
  height: auto;
}

.sent-text {
  margin: 0;
}
</style>
