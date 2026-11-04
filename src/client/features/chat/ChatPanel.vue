<script setup lang="ts">
import type { Room } from '#shared/domain.ts'
import { computed, nextTick, useTemplateRef, watch, type ComponentPublicInstance } from 'vue'
import { useMessagesStore } from '../../stores/messages.ts'
import { useRealtimeStore } from '../../stores/realtime.ts'
import { useRoomsStore } from '../../stores/rooms.ts'
import MessageComposer from './MessageComposer.vue'
import MessageList from './MessageList.vue'
import RoomHeader from './RoomHeader.vue'

const props = defineProps<{ room: Room | null }>()
const messages = useMessagesStore()
const realtime = useRealtimeStore()
const rooms = useRoomsStore()
const list = useTemplateRef<InstanceType<typeof MessageList>>('list')
const card = useTemplateRef<ComponentPublicInstance>('card')

const roomMessages = computed(() => (props.room ? messages.listFor(props.room.id) : []))
const status = computed(() => (props.room ? messages.statusOf(props.room.id) : 'idle'))
const loadingMessages = computed(() => (props.room ? messages.isLoading(props.room.id) : false))

function loadMessages(): void {
  if (props.room) void messages.load(props.room.id)
}

// The list also loads again by itself every few seconds while it can't; Retry needn't wait.
function loadRooms(): void {
  void rooms.load()
}

// Opening a room follows it live, and loads its messages each time it opens: others may have
// written since it was last open. The card shows the room from its top: on a short screen, it may
// have been scrolled down to reach Submit, which would hide the next room's title.
watch(
  () => props.room?.id,
  (roomId) => {
    void realtime.openRoom(roomId ?? null)
    const element = card.value?.$el as HTMLElement | undefined
    if (element) element.scrollTop = 0
  },
  { immediate: true },
)

// The user's own message always comes into view, even if they had scrolled up to read.
async function showSentMessage(): Promise<void> {
  await nextTick()
  list.value?.scrollToBottom()
}
</script>

<template>
  <v-card ref="card" tag="aside" class="chat-panel" aria-label="Chat" elevation="8" rounded="lg">
    <template v-if="room">
      <!-- Keyed by room, so a rename left open in one room never carries over to the next. -->
      <RoomHeader :key="`header-${room.id}`" :room="room" />
      <!-- Keyed by room, so each room opens on its newest messages. The draft lives in the
           drafts store, so it comes back with the room. -->
      <MessageList
        :key="`list-${room.id}`"
        ref="list"
        :messages="roomMessages"
        :status="status"
        :loading="loadingMessages"
        @retry="loadMessages"
      />
      <MessageComposer :key="`composer-${room.id}`" :room-id="room.id" @sent="showSentMessage" />
    </template>
    <v-card-text v-else>
      <p class="text-body-1">Click on the map to start a chat</p>
      <p class="text-body-2 text-medium-emphasis">or focus the map and press Enter</p>
      <div v-if="rooms.status === 'error'" class="mt-4">
        <p role="alert" class="mb-2">Couldn't load the chatrooms.</p>
        <v-btn variant="tonal" :loading="rooms.loading" @click="loadRooms">Retry</v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.chat-panel {
  --chat-panel-top: 16px;

  position: absolute;
  top: var(--chat-panel-top);
  right: 16px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(360px, calc(100% - 32px));
  /* Stops 56px short of the bottom edge, where the map's attribution must stay visible. The
     message list scrolls inside this height. When even the header and the composer don't fit, as
     on a very short screen, the whole card scrolls instead, so Submit stays within reach. */
  max-height: calc(100% - var(--chat-panel-top) - 56px);
  overflow-y: auto;
}

/* Leaflet's zoom buttons take the map's top-left corner, 44px across and 74px down (FR-1). Below
   436px wide (16 + 360 + 16 + 44), the panel would come within 16px of them, or cover them: there
   it starts 16px below them instead, and keeps its width for the chat. */
@media (max-width: 435px) {
  .chat-panel {
    --chat-panel-top: 90px;
  }
}

/* Below 463px tall (the 57px header, 90px, an empty room's 260px and the bottom's 56px), that
   would cut off the message field and Submit: there the panel keeps its height and sits 16px
   right of the zoom buttons instead, narrower. */
@media (max-width: 435px) and (max-height: 462px) {
  .chat-panel {
    --chat-panel-top: 16px;

    left: 60px;
    width: auto;
  }
}
</style>
