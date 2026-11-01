<script setup lang="ts">
import type { Coordinates } from '#shared/schemas.ts'
import { computed, onMounted, ref } from 'vue'
import ChatPanel from './features/chat/ChatPanel.vue'
import ChatMap from './features/map/ChatMap.vue'
import { useRoomsStore } from './stores/rooms.ts'
import { useSessionStore } from './stores/session.ts'

const rooms = useRoomsStore()
const session = useSessionStore()
const errorMessage = ref<string | null>(null)

/** The open room, once it has loaded. An unknown id in the URL leaves the panel empty. */
const selectedRoom = computed(() =>
  session.selectedRoomId === null ? null : (rooms.byId.get(session.selectedRoomId) ?? null),
)

onMounted(async () => {
  await rooms.load()
  // A link can name a room older than the ones the list holds.
  if (session.selectedRoomId !== null) await rooms.ensureLoaded(session.selectedRoomId)
})

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
    .catch(() => {
      errorMessage.value = "Couldn't create the chatroom. Please try again."
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
