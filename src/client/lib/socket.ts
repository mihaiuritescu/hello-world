import type { ClientToServerEvents, ServerToClientEvents } from '#shared/events.ts'
import { io, type Socket } from 'socket.io-client'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/**
 * Opens the app's connection to its own origin, over WebSocket only, as the server accepts
 * nothing else. Socket.IO reconnects by itself, with backoff.
 */
export function connectSocket(): AppSocket {
  return io({ transports: ['websocket'] })
}
