import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { ClientToServerEvents, ServerToClientEvents, SubscribeReply } from '#shared/events.ts'
import { RoomSubscriptionSchema } from '#shared/schemas.ts'
import type { FastifyInstance } from 'fastify'
import { Server, type Socket } from 'socket.io'
import type { Broadcaster } from './broadcaster.ts'

type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>

const ROOM_CHANNEL_PREFIX = 'room:'

/** The channel of the clients that have a room open. */
function roomChannel(roomId: number): string {
  return `${ROOM_CHANNEL_PREFIX}${roomId}`
}

/**
 * Real-time delivery over Socket.IO, on the app's own HTTP server and origin. This is the only
 * file that knows which adapter runs: the in-memory one, as there is a single instance. A second
 * instance would bring a shared adapter here, and nowhere else.
 */
export function attachSocketServer(
  app: FastifyInstance,
  { publicHost }: { publicHost: string | null },
): Broadcaster {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
    // WebSocket only, without long-polling, so a load balancer in front needs no sticky sessions.
    transports: ['websocket'],
    serveClient: false,
    // Clients send nothing but subscriptions: the HTTP body limit is plenty.
    maxHttpBufferSize: 16 * 1024,
    allowRequest: (request, accept) => {
      accept(null, isOwnOrigin(request, publicHost))
    },
  })

  // The raw connections under the WebSockets, so shutdown can cut off clients that never answer.
  const upgraded = new Set<Duplex>()
  app.server.on('upgrade', (_request: IncomingMessage, connection: Duplex) => {
    upgraded.add(connection)
    connection.once('close', () => upgraded.delete(connection))
  })

  io.on('connection', (socket) => {
    // Both arguments come straight from the client: the answer may be missing, or not a function.
    socket.on('room:subscribe', (subscription: unknown, answer: unknown) => {
      const parsed = RoomSubscriptionSchema.safeParse(subscription)
      if (parsed.success) follow(socket, parsed.data.roomId)
      const reply: SubscribeReply = parsed.success
        ? { ok: true }
        : { ok: false, error: 'VALIDATION_FAILED' }
      if (typeof answer === 'function') (answer as (reply: SubscribeReply) => void)(reply)
    })
  })

  // Closing the engine ends every connection without a Socket.IO disconnect packet, so clients
  // treat it as a lost connection and reconnect by themselves (I6). A client that never answers
  // the close handshake would hold the server open for ws's 30 s timeout, past the shutdown's
  // grace period, so the raw connections go too: to the client, that is still a lost connection.
  app.addHook('preClose', (done) => {
    io.engine.close()
    for (const connection of upgraded) connection.destroy()
    done()
  })

  return {
    roomCreated: (room) => {
      io.emit('room:created', room)
    },
    messageCreated: (message) => {
      io.to(roomChannel(message.roomId)).emit('message:created', message)
    },
  }
}

/**
 * Whether a WebSocket handshake comes from the app's own pages, or from a client that sends no
 * Origin at all, which no browser does. Browsers don't apply CORS to WebSockets, so without this
 * any website could open sockets to the app from its visitors' browsers.
 *
 * Deployments set `PUBLIC_URL`, and only its host is trusted: a DNS-rebinding page controls the
 * Host header and would match it. Local runs fall back to the request's Host, which the Vite dev
 * proxy keeps.
 */
function isOwnOrigin(request: IncomingMessage, publicHost: string | null): boolean {
  const { origin, host } = request.headers
  if (origin === undefined) return true
  try {
    return new URL(origin).host === (publicHost ?? host)
  } catch {
    // Not a URL, such as the "null" origin of a sandboxed page.
    return false
  }
}

/**
 * Moves a client to one room's channel. A client follows only the room it has open, so it
 * leaves the one it followed before. The in-memory adapter joins and leaves synchronously.
 */
function follow(socket: ClientSocket, roomId: number): void {
  for (const channel of socket.rooms) {
    if (channel.startsWith(ROOM_CHANNEL_PREFIX)) void socket.leave(channel)
  }
  void socket.join(roomChannel(roomId))
}
