<script setup lang="ts">
import type { Coordinates } from '#shared/schemas.ts'
import { computed, onMounted, ref } from 'vue'
import ChatPanel from './features/chat/ChatPanel.vue'
import ChatMap from './features/map/ChatMap.vue'
import { isRateLimited } from './lib/http.ts'
import { roomTitle } from './lib/roomTitle.ts'
import { useRealtimeStore } from './stores/realtime.ts'
import { useRoomsStore } from './stores/rooms.ts'
import { useSessionStore } from './stores/session.ts'

const rooms = useRoomsStore()
const session = useSessionStore()
const realtime = useRealtimeStore()
const errorMessage = ref<string | null>(null)

/** The open room, once it has loaded. An unknown id in the URL leaves the panel empty. */
const selectedRoom = computed(() =>
  session.selectedRoomId === null ? null : (rooms.byId.get(session.selectedRoomId) ?? null),
)

onMounted(async () => {
  // Live updates start alongside the first load. Once connected, the rooms load again, which
  // covers anything created between this load and the connection.
  realtime.connect()
  await rooms.load()
  if (session.selectedRoomId !== null) await openLinkedRoom(session.selectedRoomId)
})

/** Opens the room a link names: it may be older than the rooms the list holds, or not exist. */
async function openLinkedRoom(roomId: number): Promise<void> {
  try {
    await rooms.ensureLoaded(roomId)
  } catch {
    errorMessage.value = `Couldn't open ${roomTitle({ id: roomId })}. Please reload the page.`
    return
  }
  // Unless the user has already picked another room, a link to no room leaves the start screen.
  if (!rooms.byId.has(roomId) && session.selectedRoomId === roomId) {
    errorMessage.value = `${roomTitle({ id: roomId })} doesn't exist.`
    session.selectRoom(null)
  }
}

// Every choice the user makes (a new room, or a pin) supersedes the earlier ones, so a slow
// create can't take over the panel after the user has picked something else.
let latestChoice = 0

function openRoom(roomId: number): void {
  latestChoice += 1
  session.selectRoom(roomId)
}

function createRoomAt(coordinates: Coordinates): void {
  const choice = (latestChoice += 1)
  rooms
    .create(coordinates)
    .then((room) => {
      if (choice === latestChoice) session.selectRoom(room.id)
    })
    .catch((error: unknown) => {
      errorMessage.value = isRateLimited(error)
        ? "You're creating chatrooms too fast. Wait a minute, then try again."
        : "Couldn't create the chatroom. Please try again."
    })
}
</script>

<template>
  <v-app>
    <v-main>
      <!-- The panel is a sibling of the map, never inside it, so its clicks never reach Leaflet. -->
      <div class="map-shell">
        <ChatMap
          :rooms="rooms.list"
          :selected-room-id="session.selectedRoomId"
          @create-at="createRoomAt"
          @select="openRoom"
        />
        <ChatPanel :room="selectedRoom" />
      </div>
      <v-snackbar
        :model-value="errorMessage !== null"
        color="error"
        @update:model-value="errorMessage = null"
      >
        {{ errorMessage }}
      </v-snackbar>
    </v-main>
  </v-app>
</template>

<style scoped>
.map-shell {
  position: relative;
  height: 100dvh;
}
</style>
