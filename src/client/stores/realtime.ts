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
  const started = ref(false)
  let socket: AppSocket | null = null
  /** The room the user has open: the one to follow, and to reload after a reconnect. */
  let openRoomId: number | null = null

  // Polls while live updates can't be relied on to bring everything: before the first
  // connection, between connections, and while the rooms failed to reload after one.
  const polling = useIntervalFn(refresh, POLL_INTERVAL_MS, { immediate: false })
  watch(
    [started, status, () => rooms.status],
    ([isStarted, connection, roomsStatus]) => {
      if (isStarted && (connection !== 'live' || roomsStatus === 'error')) polling.resume()
      else polling.pause()
    },
    { flush: 'sync' },
  )

  function refresh(): void {
    void rooms.load()
    if (openRoomId !== null) void messages.load(openRoomId)
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
    // Socket.IO reconnects by itself, except after the server ended the session on purpose.
    if (reason === 'io server disconnect') socket?.connect()
  }

  /** Follows a room's messages: subscribes, then loads them (I2). Offline, it only loads. */
  async function openRoom(roomId: number | null): Promise<void> {
    openRoomId = roomId
    if (roomId === null) return
    if (status.value === 'live') await subscribeAndLoad(roomId)
    else await messages.load(roomId)
  }

  async function subscribeAndLoad(roomId: number): Promise<void> {
    if (!socket) return
    // True once the server follows the room for this client. False when it refused, or when the
    // connection dropped first: then the next connect subscribes again.
    const followed = socket.emitWithAck('room:subscribe', { roomId }).then(
      (reply) => reply.ok,
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

  return { status, connect, openRoom }
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
