<script setup lang="ts">
import { LIMITS, type Room } from '#shared/domain.ts'
import { textProblem } from '#shared/text.ts'
import { mdiPencilOutline } from '@mdi/js'
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { ApiError, isRateLimited } from '../../lib/http.ts'
import { defaultRoomTitle, roomTitle } from '../../lib/roomTitle.ts'
import { useRealtimeStore } from '../../stores/realtime.ts'
import { useRoomsStore } from '../../stores/rooms.ts'
import { useSessionStore } from '../../stores/session.ts'
import ConnectionChip from './ConnectionChip.vue'

const props = defineProps<{ room: Room }>()
const rooms = useRoomsStore()
const session = useSessionStore()
const realtime = useRealtimeStore()

const title = computed(() => roomTitle(props.room))
/** Only the browser that created a room holds its owner token, and may change the room. */
const isCreator = computed(() => session.ownsRoom(props.room.id))

const renaming = ref(false)
const draftName = ref('')
const saving = ref(false)
const renameError = ref<string | null>(null)
const renameButton = useTemplateRef<{ $el: HTMLElement }>('renameButton')
const nameField = useTemplateRef<{ focus: () => void }>('nameField')

/** Why the typed name can't be used, once it has any text. The server applies the same rules. */
const nameProblem = computed(() => {
  const name = draftName.value.trim()
  return name === '' ? null : textProblem(name)
})

// The focus follows the user's choice: into the field, and back to the button when done.
async function startRenaming(): Promise<void> {
  draftName.value = props.room.name ?? ''
  renameError.value = null
  renaming.value = true
  await nextTick()
  nameField.value?.focus()
}

async function stopRenaming(): Promise<void> {
  renaming.value = false
  await nextTick()
  renameButton.value?.$el.focus()
}

// An emptied field brings back the default name, which the server stores as null.
async function saveName(): Promise<void> {
  if (saving.value || nameProblem.value !== null) return
  const name = draftName.value.trim()
  saving.value = true
  renameError.value = null
  try {
    await rooms.rename(props.room.id, name === '' ? null : name)
    await stopRenaming()
  } catch (error) {
    renameError.value = renameFailure(error)
  } finally {
    saving.value = false
  }
}

function renameFailure(error: unknown): string {
  if (isRateLimited(error)) return "You're renaming rooms too fast. Wait a minute, then try again."
  if (error instanceof ApiError && error.status === 403) {
    return 'Only the browser that created this room can rename it.'
  }
  return "Couldn't rename the room. Please try again."
}

// A typed name that has changed since the failure makes the error stale.
function clearRenameError(): void {
  renameError.value = null
}
</script>

<template>
  <div class="room-header">
    <form v-if="renaming" class="room-header__rename" @submit.prevent="saveName">
      <v-text-field
        ref="nameField"
        v-model="draftName"
        label="Room name"
        :placeholder="defaultRoomTitle(room.id)"
        persistent-placeholder
        :maxlength="LIMITS.roomName"
        autocomplete="off"
        density="compact"
        hide-details="auto"
        :error-messages="renameError ?? nameProblem ?? []"
        @update:model-value="clearRenameError"
        @keydown.esc="stopRenaming"
      />
      <div class="room-header__rename-actions">
        <v-btn variant="text" @click="stopRenaming">Cancel</v-btn>
        <v-btn type="submit" color="primary" :loading="saving" :disabled="nameProblem !== null">
          Save
        </v-btn>
      </div>
    </form>
    <template v-else>
      <div class="room-header__titles">
        <v-card-title tag="h2" class="room-header__title">{{ title }}</v-card-title>
        <!-- The number stays in view under a custom name, so no name can pass for another room. -->
        <v-card-subtitle v-if="room.name !== null">{{ defaultRoomTitle(room.id) }}</v-card-subtitle>
      </div>
      <v-btn
        v-if="isCreator"
        ref="renameButton"
        class="room-header__action"
        :icon="mdiPencilOutline"
        variant="text"
        size="small"
        aria-label="Rename this room"
        @click="startRenaming"
      />
    </template>
    <ConnectionChip :status="realtime.status" class="room-header__connection" />
  </div>
</template>

<style scoped>
/* The buttons and the chip line up with the title's first line, however many lines it takes. */
.room-header {
  display: flex;
  flex: none;
  align-items: flex-start;
  gap: 4px;
  padding-inline-end: 16px;
}

.room-header__titles {
  flex: 1 1 auto;
  min-width: 0;
  padding-block: 10px 6px;
}

/* Names wrap rather than lose their end: the whole name is the room's identity. Vuetify 4 keeps
   the browser's margins on headings, which would push the room's number far below its name. */
.room-header__title {
  margin: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}

.room-header__rename {
  flex: 1 1 auto;
  min-width: 0;
  padding: 12px 0 8px 16px;
}

.room-header__rename-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.room-header__action {
  flex: none;
  margin-top: 6px;
}

.room-header__connection {
  flex: none;
  margin-top: 12px;
}
</style>
