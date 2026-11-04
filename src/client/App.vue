<script setup lang="ts">
import type { Coordinates } from '#shared/schemas.ts'
import { computed, onMounted, ref, watch } from 'vue'
import ChatPanel from './features/chat/ChatPanel.vue'
import AppHeader from './features/header/AppHeader.vue'
import ChatMap from './features/map/ChatMap.vue'
import { isRateLimited } from './lib/http.ts'
import { defaultRoomTitle, roomTitle } from './lib/roomTitle.ts'
import { useRealtimeStore } from './stores/realtime.ts'
import { useRoomsStore } from './stores/rooms.ts'
import { useSessionStore } from './stores/session.ts'

const rooms = useRoomsStore()
const session = useSessionStore()
const realtime = useRealtimeStore()
/** The message the snackbar shows: an error, or news such as a deleted room. */
const notice = ref<{ text: string; tone: 'error' | 'news' } | null>(null)

function showError(text: string): void {
  notice.value = { text, tone: 'error' }
}

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

// The open room can vanish: its creator deleted it, in this window or another. The panel goes
// back to the start screen, and so does the URL, and the snackbar says why.
watch(selectedRoom, (room, previous) => {
  if (room !== null || previous === null || !rooms.isDeleted(previous.id)) return
  notice.value = { text: `${roomTitle(previous)} was deleted.`, tone: 'news' }
  if (session.selectedRoomId === previous.id) session.selectRoom(null)
})

/** Opens the room a link names: it may be older than the rooms the list holds, or not exist. */
async function openLinkedRoom(roomId: number): Promise<void> {
  const title = defaultRoomTitle(roomId)
  try {
    await rooms.ensureLoaded(roomId)
  } catch (error) {
    // The user may have picked another room while this one was on its way.
    if (session.selectedRoomId !== roomId) return
    showError(
      isRateLimited(error)
        ? `Too many requests from your network just now. Wait a minute, then reload the page to open ${title}.`
        : `Couldn't open ${title}. Please reload the page.`,
    )
    return
  }
  // Unless the user has already picked another room, a link to no room leaves the start screen.
  if (!rooms.byId.has(roomId) && session.selectedRoomId === roomId) {
    showError(`${title} doesn't exist.`)
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
      showError(
        isRateLimited(error)
          ? "You're creating chatrooms too fast. Wait a minute, then try again."
          : "Couldn't create the chatroom. Please try again.",
      )
    })
}
</script>

<template>
  <v-app>
    <!-- The header takes its own height, and the map fills the rest of the window below it. -->
    <div class="app-shell">
      <AppHeader />
      <v-main class="app-main">
        <!-- The panel is a sibling of the map, never inside it, so its clicks never reach
             Leaflet. -->
        <div class="map-shell">
          <ChatMap
            :rooms="rooms.list"
            :selected-room-id="session.selectedRoomId"
            @create-at="createRoomAt"
            @select="openRoom"
          />
          <ChatPanel :room="selectedRoom" />
        </div>
        <!-- News keeps Vuetify's dark snackbar: white on its info blue would be too faint. -->
        <v-snackbar
          :model-value="notice !== null"
          :color="notice?.tone === 'error' ? 'error' : undefined"
          @update:model-value="notice = null"
        >
          {{ notice?.text }}
        </v-snackbar>
      </v-main>
    </div>
  </v-app>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
}

.app-header {
  flex: none;
}

.app-main {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-height: 0;
}

/* A zero flex basis gives the shell a definite height, which the map's height: 100% needs. */
.map-shell {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
}
</style>
