<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
})
const emit = defineEmits(['close'])

const dialogRef = ref(null)

function onKeydown(event) {
  if (event.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  dialogRef.value?.focus()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="overlay" @mousedown.self="emit('close')">
    <div ref="dialogRef" class="dialog" role="dialog" aria-modal="true" tabindex="-1">
      <header class="dialog-header">
        <h2>{{ props.title }}</h2>
        <button class="ghost" type="button" aria-label="Закрыть" @click="emit('close')">✕</button>
      </header>

      <div class="dialog-body">
        <slot />
      </div>

      <footer v-if="$slots.footer" class="dialog-footer">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(18, 24, 33, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 8vh 1rem 1rem;
  overflow-y: auto;
  z-index: 20;
}

.dialog {
  background: var(--surface);
  border-radius: var(--radius);
  width: 100%;
  max-width: 520px;
  box-shadow: 0 18px 48px rgba(18, 24, 33, 0.24);
  outline: none;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
}

.dialog-body {
  padding: 1.25rem;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border);
}
</style>
