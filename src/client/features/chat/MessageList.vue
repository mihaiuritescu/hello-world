<script setup lang="ts">
import type { Message } from '#shared/domain.ts'
import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue'
import { formatMessageDate } from '../../lib/formatMessageDate.ts'
import type { LoadStatus } from '../../stores/rooms.ts'

const props = defineProps<{ messages: Message[]; status: LoadStatus }>()
const emit = defineEmits<{ retry: [] }>()

// Messages already here stay on screen while a reload runs. A failed load always shows, with
// Retry, even when messages are listed: they may be only the few the user just sent.
const showProgress = computed(
  () => props.messages.length === 0 && (props.status === 'idle' || props.status === 'loading'),
)
const showLog = computed(() => props.messages.length > 0 || props.status === 'ready')

/** How far from the bottom, in pixels, still counts as reading the newest messages. */
const BOTTOM_SLACK = 24

const scroller = useTemplateRef<HTMLElement>('scroller')

function scrollToBottom(): void {
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
}

// The list opens on the newest messages and follows new ones, but only while the reader is at
// the bottom: someone reading older messages isn't pulled away. It watches the newest message
// rather than the count, because a reload can drop old messages as it adds new ones. This runs
// before the DOM updates, so it measures where the reader was.
watch(
  () => props.messages[props.messages.length - 1]?.id,
  () => {
    const element = scroller.value
    const atBottom =
      !element || element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_SLACK
    if (atBottom) void nextTick(scrollToBottom)
  },
  { flush: 'pre' },
)
onMounted(scrollToBottom)

defineExpose({ scrollToBottom })
</script>

<template>
  <div v-if="status === 'error'" class="message-state">
    <p role="alert" class="mb-2">
      {{
        messages.length > 0 ? "Couldn't load the latest messages." : "Couldn't load the messages."
      }}
    </p>
    <v-btn variant="tonal" @click="emit('retry')">Retry</v-btn>
  </div>
  <div v-if="showProgress" class="message-state">
    <v-progress-linear indeterminate aria-label="Loading messages" />
  </div>
  <!-- The log appears with its first messages already inside, so screen readers announce only
       the ones that arrive later. It can scroll, so it takes keyboard focus. -->
  <div
    v-if="showLog"
    ref="scroller"
    class="message-list"
    role="log"
    aria-label="Messages"
    tabindex="0"
  >
    <p v-if="messages.length === 0" class="message-list__empty text-medium-emphasis">
      No messages yet
    </p>
    <ol v-else class="message-list__items">
      <li v-for="message in messages" :key="message.id" class="message">
        <span class="message__author text-medium-emphasis">{{ message.authorName }}:</span>
        <p class="message__body">{{ message.body }}</p>
        <time class="message__time text-caption text-medium-emphasis" :datetime="message.createdAt">
          {{ formatMessageDate(message.createdAt) }}
        </time>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.message-state {
  padding: 8px 16px 16px;
}

.message-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px;
}

.message-list__empty {
  padding: 8px 0 16px;
}

.message-list__items {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* As in the mockups: the author on the left, the bold text beside it, the date under the text
   and a rule under each message. Nothing draws outside the row, so stacked accents in one
   message can't cover its neighbours. */
.message {
  display: grid;
  grid-template-columns: fit-content(40%) 1fr;
  column-gap: 12px;
  padding: 8px 0;
  overflow: clip;
  border-bottom: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.message__author {
  grid-row: span 2;
  overflow-wrap: anywhere;
}

.message__body {
  margin: 0;
  font-weight: 600;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.message__time {
  grid-column: 2;
  justify-self: end;
}
</style>
