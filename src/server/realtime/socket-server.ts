import type { IncomingMessage } from 'node:http'
import type { BlockList } from 'node:net'
import type { Duplex } from 'node:stream'
import type {
  ClientToServerEvents,
  Presence,
  ServerToClientEvents,
  SubscribeReply,
} from '#shared/events.ts'
import { RoomSubscriptionSchema } from '#shared/schemas.ts'
import type { FastifyInstance } from 'fastify'
import { Server, type Socket } from 'socket.io'
import { clientAddress } from '../client-address.ts'
import type { Broadcaster } from './broadcaster.ts'

type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>

/** The parts of the Socket.IO server that presence tracking uses. */
interface PresenceServer {
  of(namespace: '/'): { sockets: { size: number } }
  emit(event: 'presence:changed', presence: Presence): unknown
}

/** The parts of a client's socket that presence tracking uses. */
interface PresenceSocket {
  emit(event: 'presence:changed', presence: Presence): unknown
  on(event: 'disconnect', listener: () => void): unknown
}

/** The parts of an Engine.IO connection, under each Socket.IO one, that this file uses. */
interface EngineConnection {
  request: IncomingMessage
  /**
   * Packets waiting for the client to take them. Engine.IO keeps this private, so it's read with
   * care, and the tests check it against a real engine.
   */
  writeBuffer?: unknown[]
  on(event: 'packetCreate', listener: () => void): void
  once(event: 'close', listener: () => void): void
  close(discard: boolean): void
}

interface SocketServerOptions {
  /** See `Config.publicHost`. */
  publicHost: string | null
  /** See `Config.trustedProxies`. */
  trustedProxies: BlockList | null
  /** Connections one client address may hold open at once. */
  socketsPerAddress: number
  /** Subscriptions one connection may send a minute. */
  subscriptionsPerMinute: number
  /** The shortest gap between two online counts sent to every client. Tests change it. */
  presenceIntervalMs?: number
}

const ROOM_CHANNEL_PREFIX = 'room:'
const MINUTE_MS = 60_000
/** Online counts reach every client at most this often. */
const PRESENCE_INTERVAL_MS = 1_000
/** Packets queued for one connection before it counts as stalled. */
const MAX_BACKLOG = 500
const RATE_LIMITED: SubscribeReply = { ok: false, error: 'RATE_LIMITED' }

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
  {
    publicHost,
    trustedProxies,
    socketsPerAddress,
    subscriptionsPerMinute,
    presenceIntervalMs = PRESENCE_INTERVAL_MS,
  }: SocketServerOptions,
): Broadcaster {
  // Open connections per client address. Engine.IO answers WebSocket handshakes before Fastify
  // sees them, so the HTTP rate limits don't cover sockets. Past the cap, handshakes are refused:
  // the client keeps trying with its backoff, and polls over HTTP meanwhile.
  const openByAddress = new Map<string, number>()

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
    // WebSocket only, without long-polling, so a load balancer in front needs no sticky sessions.
    transports: ['websocket'],
    serveClient: false,
    // Clients send nothing but subscriptions: the HTTP body limit is plenty.
    maxHttpBufferSize: 16 * 1024,
    allowRequest: (request, accept) => {
      const open = openByAddress.get(clientAddress(request, trustedProxies)) ?? 0
      accept(null, isOwnOrigin(request, publicHost) && open < socketsPerAddress)
    },
  })

  io.engine.on('connection', (connection: EngineConnection) => {
    const address = clientAddress(connection.request, trustedProxies)
    openByAddress.set(address, (openByAddress.get(address) ?? 0) + 1)
    connection.once('close', () => {
      const open = (openByAddress.get(address) ?? 1) - 1
      if (open > 0) openByAddress.set(address, open)
      else openByAddress.delete(address)
    })
    closeWhenStalled(connection)
  })

  // The raw connections under the WebSockets, so shutdown can cut off clients that never answer.
  const upgraded = new Set<Duplex>()
  app.server.on('upgrade', (_request: IncomingMessage, connection: Duplex) => {
    upgraded.add(connection)
    connection.once('close', () => upgraded.delete(connection))
  })

  const presence = trackPresence(io, presenceIntervalMs)

  // A browser opens one socket on its connection. A burst of CONNECT packets down one WebSocket
  // would open a socket for each, past the cap per address, into the online count and into every
  // broadcast. The second and later ones are refused, until the first one leaves.
  const withSocket = new WeakSet<object>()
  io.use((socket, next) => {
    if (withSocket.has(socket.conn)) {
      next(new Error('ONE_SOCKET_PER_CONNECTION'))
      return
    }
    withSocket.add(socket.conn)
    socket.on('disconnect', () => withSocket.delete(socket.conn))
    next()
  })

  io.on('connection', (socket) => {
    presence.joined(socket)
    limitEvents(socket, subscriptionsPerMinute)
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
    presence.stop()
    io.engine.close()
    for (const connection of upgraded) connection.destroy()
    done()
  })

  return {
    roomCreated: (room) => {
      io.emit('room:created', room)
    },
    roomUpdated: (room) => {
      io.emit('room:updated', room)
    },
    roomDeleted: (roomId) => {
      io.emit('room:deleted', { id: roomId })
    },
    messageCreated: (message) => {
      io.to(roomChannel(message.roomId)).emit('message:created', message)
    },
  }
}

/**
 * Keeps clients told how many windows have the app open: a new client at once, and every client
 * whenever the count changes. A change goes out straight away unless a count went out less than
 * `intervalMs` ago; then the latest count follows when the interval ends. After a restart, when
 * every client reconnects within seconds, that sends a handful of counts instead of one to each
 * client per reconnect, which would also fill the queues that `closeWhenStalled` watches.
 *
 * A count goes out even when it equals the last one sent: clients that joined in between were
 * told the count of their own moment, which may have been different.
 */
export function trackPresence(io: PresenceServer, intervalMs: number) {
  let lastAnnouncedAt = -Infinity
  let timer: NodeJS.Timeout | undefined
  let stopped = false

  const online = (): number => io.of('/').sockets.size

  function announce(): void {
    timer = undefined
    lastAnnouncedAt = Date.now()
    io.emit('presence:changed', { online: online() })
  }

  // Socket.IO removes a socket from its namespace before 'disconnect' fires, so the count read
  // when the timer ends never includes a client that has left.
  function changed(): void {
    if (stopped || timer) return
    timer = setTimeout(announce, Math.max(0, lastAnnouncedAt + intervalMs - Date.now()))
  }

  return {
    joined(socket: PresenceSocket): void {
      socket.emit('presence:changed', { online: online() })
      socket.on('disconnect', changed)
      changed()
    },
    /** Sends nothing more: shutdown disconnects every client, and each would schedule a count. */
    stop(): void {
      stopped = true
      clearTimeout(timer)
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
 * Cuts off a connection whose client stopped reading. Nothing caps what the server sends, and a
 * client that answers the heartbeat is never timed out, so its packets would queue without end.
 * `close(true)` drops the queue: a plain close waits for it to drain, which never happens. An
 * honest but slow client reconnects with its backoff, then reloads what it missed (I2).
 */
export function closeWhenStalled(
  connection: Pick<EngineConnection, 'writeBuffer' | 'on' | 'close'>,
  maxBacklog = MAX_BACKLOG,
): void {
  // The engine announces each packet just before it queues it.
  // A missing queue (a changed Engine.IO) must not throw here, inside every broadcast.
  connection.on('packetCreate', () => {
    if ((connection.writeBuffer?.length ?? 0) >= maxBacklog) connection.close(true)
  })
}

/**
 * Caps the events a connection sends, in fixed one-minute windows; clients send nothing but
 * subscriptions. An event past the cap gets RATE_LIMITED as its answer and goes no further. The
 * connection stays open: after a server disconnect, the client would reconnect at once, in a loop.
 */
function limitEvents(socket: ClientSocket, perMinute: number): void {
  let windowStart = Date.now()
  let count = 0
  socket.use((event, next) => {
    const now = Date.now()
    if (now - windowStart >= MINUTE_MS) {
      windowStart = now
      count = 0
    }
    count += 1
    if (count <= perMinute) {
      next()
      return
    }
    const answer: unknown = event.at(-1)
    if (typeof answer === 'function') (answer as (reply: SubscribeReply) => void)(RATE_LIMITED)
  })
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
