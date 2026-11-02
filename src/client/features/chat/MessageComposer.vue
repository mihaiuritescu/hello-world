<script setup lang="ts">
import { LIMITS } from '#shared/domain.ts'
import { textProblem } from '#shared/text.ts'
import { computed, watch } from 'vue'
import { useDraftsStore } from '../../stores/drafts.ts'
import { useSessionStore } from '../../stores/session.ts'

const props = defineProps<{ roomId: number }>()
const emit = defineEmits<{ sent: [] }>()
const drafts = useDraftsStore()
const session = useSessionStore()

// The panel keys the composer by room, so the room never changes under it. The draft itself
// lives in the store and outlives the composer.
const draft = drafts.draftFor(props.roomId)

/** Why a field's text can't be sent, once it has any. The server applies the same rules. */
function problemWith(text: string): string | null {
  const trimmed = text.trim()
  return trimmed === '' ? null : textProblem(trimmed)
}
const nameProblem = computed(() => problemWith(session.authorName))
const messageProblem = computed(() => problemWith(draft.text))

const canSend = computed(
  () =>
    !draft.sending &&
    session.authorName.trim() !== '' &&
    draft.text.trim() !== '' &&
    nameProblem.value === null &&
    messageProblem.value === null,
)

// A send error is about the draft as it was. Editing the draft makes it stale.
watch([() => session.authorName, () => draft.text], () => {
  draft.error = null
})

async function send(): Promise<void> {
  if (!canSend.value) return
  if (await drafts.send(props.roomId, session.authorName)) emit('sent')
}
</script>

<template>
  <form class="composer" @submit.prevent="send">
    <v-text-field
      v-model="session.authorName"
      label="User name"
      placeholder="write your user name here"
      persistent-placeholder
      :maxlength="LIMITS.authorName"
      autocomplete="nickname"
      density="compact"
      hide-details="auto"
      :error-messages="nameProblem ?? []"
    />
    <div class="composer__row">
      <v-text-field
        v-model="draft.text"
        label="Message"
        placeholder="write message here"
        persistent-placeholder
        :maxlength="LIMITS.messageBody"
        autocomplete="off"
        density="compact"
        hide-details="auto"
        :error-messages="draft.error ?? messageProblem ?? []"
      />
      <v-btn
        type="submit"
        color="primary"
        height="40"
        :loading="draft.sending"
        :disabled="!canSend"
      >
        Submit
      </v-btn>
    </div>
  </form>
</template>

<style scoped>
.composer {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 16px;
}

.composer__row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
</style>
