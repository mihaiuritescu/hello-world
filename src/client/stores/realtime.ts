import { useIntervalFn } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { connectSocket, type AppSocket } from '../lib/socket.ts'
import { useMessagesStore } from './messages.ts'
import { useRoomsStore } from './rooms.ts'

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting'

/** How often the app refreshes over HTTP while it can't rely on live updates. */
const POLL_INTERVAL_MS = 10_000
/** How long a subscription waits for the server's answer before the room loads anyway. */
const SUBSCRIBE_TIMEOUT_MS = 5_000

export const useRealtimeStore = defineStore('realtime', () => {
  const rooms = useRoomsStore()
  const messages = useMessagesStore()

  const status = ref<ConnectionStatus>('connecting')
  /**
   * How many windows have the app open, as the server last said. Null until it says, and while
   * disconnected: an old count would claim people are still here when nobody can tell.
   */
  const online = ref<number | null>(null)
  const started = ref(false)
  let socket: AppSocket | null = null
  /** The room the user has open: the one to follow, and to reload after a reconnect. */
  let openRoomId: number | null = null
  /**
   * True while the server refuses to follow the open room, which it does past its limit for one
   * connection. The connection stays open, so no reconnect would subscribe again.
   */
  const refused = ref(false)

  // Polls while live updates can't be relied on to bring everything: before the first
  // connection, between connections, while the rooms failed to reload after one, and while the
  // server refuses to follow the open room.
  const polling = useIntervalFn(refresh, POLL_INTERVAL_MS, { immediate: false })
  watch(
    [started, status, () => rooms.status, refused],
    ([isStarted, connection, roomsStatus, isRefused]) => {
      if (isStarted && (connection !== 'live' || roomsStatus === 'error' || isRefused)) {
        polling.resume()
      } else {
        polling.pause()
      }
    },
    { flush: 'sync' },
  )

  function refresh(): void {
    void rooms.load()
    if (openRoomId === null) return
    // A refused room asks to be followed again on every tick; subscribing also reloads it (I2).
    if (status.value === 'live' && refused.value) void subscribeAndLoad(openRoomId)
    else void messages.load(openRoomId)
  }

  /** Opens the app's one connection. Later calls do nothing. */
  function connect(): void {
    if (socket) return
    socket = connectSocket()
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    // Announcements go through the same upserts as HTTP responses, which drop duplicates (I4).
    socket.on('room:created', rooms.upsert)
    socket.on('message:created', messages.upsert)
    socket.on('presence:changed', (presence) => {
      online.value = presence.online
    })
    started.value = true
  }

  // Every connect, the first one included, catches up on what the socket may have missed: the
  // rooms, then the open room, subscribing before reading it (I2).
  function onConnect(): void {
    status.value = 'live'
    void rooms.load()
    if (openRoomId !== null) void subscribeAndLoad(openRoomId)
  }

  function onDisconnect(reason: string): void {
    status.value = 'reconnecting'
    online.value = null
    // The next connection starts afresh, and subscribes to the open room again.
    refused.value = false
    // Socket.IO reconnects by itself, except after the server ended the session on purpose.
    if (reason === 'io server disconnect') socket?.connect()
  }

  /** Follows a room's messages: subscribes, then loads them (I2). Offline, it only loads. */
  async function openRoom(roomId: number | null): Promise<void> {
    openRoomId = roomId
    refused.value = false
    if (roomId === null) return
    messages.markLoading(roomId)
    if (status.value === 'live') await subscribeAndLoad(roomId)
    else await messages.load(roomId)
  }

  async function subscribeAndLoad(roomId: number): Promise<void> {
    if (!socket) return
    // True once the server follows the room for this client. False when it refused, which leaves
    // the polling to subscribe again, or when the connection dropped first: then the next
    // connect subscribes again.
    const followed = socket.emitWithAck('room:subscribe', { roomId }).then(
      (reply) => {
        if (openRoomId === roomId) refused.value = !reply.ok
        return reply.ok
      },
      () => false,
    )
    const answer = await withDeadline(followed, SUBSCRIBE_TIMEOUT_MS)
    // The user may have opened another room while the answer was on its way.
    if (openRoomId === roomId) await messages.load(roomId)
    // A late answer means the server followed the room only from then on: messages posted before
    // it came neither live nor in the load above, so the room loads again (I2). A dead connection
    // never answers; Socket.IO's heartbeat drops it, and the reconnect resyncs.
    if (answer === LATE && (await followed) && openRoomId === roomId) await messages.load(roomId)
  }

  return { status, online, connect, openRoom }
})

const LATE = 'late'

/** Settles like `promise`, or with `LATE` when that takes longer than `ms`. */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | typeof LATE> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<typeof LATE>((resolve) => {
    timer = setTimeout(() => resolve(LATE), ms)
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

// A hot update of this store would leave the old socket connected, with the old handlers. The
// page reloads instead, so development never holds two sockets or binds an event twice.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload())
