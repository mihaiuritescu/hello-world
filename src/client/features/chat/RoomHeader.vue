<script setup lang="ts">
import { LIMITS, type Room } from '#shared/domain.ts'
import { textProblem } from '#shared/text.ts'
import { mdiDeleteOutline, mdiPencilOutline } from '@mdi/js'
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { ApiError, isRateLimited } from '../../lib/http.ts'
import { defaultRoomTitle, roomLabel, roomTitle } from '../../lib/roomTitle.ts'
import { useMessagesStore } from '../../stores/messages.ts'
import { useRealtimeStore } from '../../stores/realtime.ts'
import { useRoomsStore } from '../../stores/rooms.ts'
import { useSessionStore } from '../../stores/session.ts'
import ConnectionChip from './ConnectionChip.vue'

const props = defineProps<{ room: Room }>()
const rooms = useRoomsStore()
const session = useSessionStore()
const realtime = useRealtimeStore()
const messages = useMessagesStore()

const title = computed(() => roomTitle(props.room))
/** The name with the number, for the dialog, which shows no number beside it. */
const label = computed(() => roomLabel(props.room))
/** Only the browser that created a room holds its owner token, and may change the room. */
const isCreator = computed(() => session.ownsRoom(props.room.id))
/**
 * A room can go only while it has no messages, so the delete waits until they have loaded, and
 * goes away with the first one. The server checks again, in case one is on its way.
 */
const canDelete = computed(
  () =>
    isCreator.value &&
    messages.statusOf(props.room.id) === 'ready' &&
    messages.listFor(props.room.id).length === 0,
)

const confirmingDelete = ref(false)
const deleting = ref(false)
const deleteError = ref<string | null>(null)
const deleteTitleId = useId()

// Each confirmation starts afresh: an earlier refusal may no longer hold.
watch(confirmingDelete, (open) => {
  if (open) deleteError.value = null
})

async function confirmDelete(): Promise<void> {
  if (deleting.value) return
  deleting.value = true
  deleteError.value = null
  try {
    // Once the room is gone, the panel goes back to the start screen, and this dialog with it.
    await rooms.deleteRoom(props.room.id)
  } catch (error) {
    deleteError.value = deleteFailure(error)
  } finally {
    deleting.value = false
  }
}

function deleteFailure(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'Someone has just written in this room, so it can no longer be deleted.'
  }
  if (isRateLimited(error)) return "You're deleting rooms too fast. Wait a minute, then try again."
  if (error instanceof ApiError && error.status === 403) {
    return 'Only the browser that created this room can delete it.'
  }
  return "Couldn't delete the room. Please try again."
}

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
      <!-- Stays while open, even if a message arrives meanwhile: the refusal then says why. -->
      <v-dialog
        v-if="canDelete || confirmingDelete"
        v-model="confirmingDelete"
        max-width="400"
        :aria-labelledby="deleteTitleId"
      >
        <template #activator="{ props: activatorProps }">
          <v-btn
            v-bind="activatorProps"
            class="room-header__action"
            :icon="mdiDeleteOutline"
            variant="text"
            size="small"
            aria-label="Delete this room"
          />
        </template>
        <v-card>
          <v-card-title :id="deleteTitleId" tag="h2" class="room-header__dialog-title">
            Delete {{ label }}?
          </v-card-title>
          <v-card-text>Its pin disappears for everyone, and this can't be undone.</v-card-text>
          <v-card-text v-if="deleteError" role="alert" class="text-error">
            {{ deleteError }}
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn @click="confirmingDelete = false">Cancel</v-btn>
            <v-btn color="error" :loading="deleting" @click="confirmDelete">Delete</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
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

/* The dialog is teleported out of this component, but scoped styles follow its slot content. */
.room-header__dialog-title {
  margin: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>
