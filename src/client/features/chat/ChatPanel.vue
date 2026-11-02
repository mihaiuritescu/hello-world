<script setup lang="ts">
import type { Room } from '#shared/domain.ts'
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { roomTitle } from '../../lib/roomTitle.ts'
import { useMessagesStore } from '../../stores/messages.ts'
import { useRealtimeStore } from '../../stores/realtime.ts'
import { useRoomsStore } from '../../stores/rooms.ts'
import ConnectionChip from './ConnectionChip.vue'
import MessageComposer from './MessageComposer.vue'
import MessageList from './MessageList.vue'

const props = defineProps<{ room: Room | null }>()
const messages = useMessagesStore()
const realtime = useRealtimeStore()
const rooms = useRoomsStore()
const list = useTemplateRef<InstanceType<typeof MessageList>>('list')

const roomMessages = computed(() => (props.room ? messages.listFor(props.room.id) : []))
const status = computed(() => (props.room ? messages.statusOf(props.room.id) : 'idle'))

function loadMessages(): void {
  if (props.room) void messages.load(props.room.id)
}

// The list also loads again by itself every few seconds while it can't; Retry needn't wait.
function loadRooms(): void {
  void rooms.load()
}

// Opening a room follows it live, and loads its messages each time it opens: others may have
// written since it was last open.
watch(
  () => props.room?.id,
  (roomId) => void realtime.openRoom(roomId ?? null),
  { immediate: true },
)

// The user's own message always comes into view, even if they had scrolled up to read.
async function showSentMessage(): Promise<void> {
  await nextTick()
  list.value?.scrollToBottom()
}
</script>

<template>
  <v-card tag="aside" class="chat-panel" aria-label="Chat" elevation="8" rounded="lg">
    <template v-if="room">
      <div class="chat-panel__header">
        <v-card-title tag="h2">{{ roomTitle(room) }}</v-card-title>
        <ConnectionChip :status="realtime.status" class="mr-4" />
      </div>
      <!-- Keyed by room, so each room opens on its newest messages. The draft lives in the
           drafts store, so it comes back with the room. -->
      <MessageList
        :key="`list-${room.id}`"
        ref="list"
        :messages="roomMessages"
        :status="status"
        @retry="loadMessages"
      />
      <MessageComposer :key="`composer-${room.id}`" :room-id="room.id" @sent="showSentMessage" />
    </template>
    <v-card-text v-else>
      <p class="text-body-1">Click on the map to start a chat</p>
      <p class="text-body-2 text-medium-emphasis">or focus the map and press Enter</p>
      <div v-if="rooms.status === 'error'" class="mt-4">
        <p role="alert" class="mb-2">Couldn't load the chatrooms.</p>
        <v-btn variant="tonal" @click="loadRooms">Retry</v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.chat-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(360px, calc(100% - 32px));
  /* Stops short of the bottom edge, where the map's attribution must stay visible. The message
     list scrolls inside this height. */
  max-height: calc(100% - 72px);
}

.chat-panel__header {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
}
</style>
