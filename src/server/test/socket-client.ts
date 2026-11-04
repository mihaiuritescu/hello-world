import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { connect as connectTcp, type AddressInfo, type Socket as TcpSocket } from 'node:net'
import type { ClientToServerEvents, ServerToClientEvents } from '#shared/events.ts'
import type { FastifyInstance } from 'fastify'
import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client'

export type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>
type Payload<E extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[E]>[0]

/** The port a test app got from `listen({ port: 0 })`. */
export function portOf(app: FastifyInstance): number {
  return (app.server.address() as AddressInfo).port
}

/** Connects to a listening test app, as the browser does, and resolves once connected. */
export async function connectTo(
  port: number,
  options: Partial<ManagerOptions & SocketOptions> = {},
): Promise<TestSocket> {
  const socket: TestSocket = io(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    ...options,
  })
  await whenConnected(socket)
  return socket
}

/**
 * Connects like `connectTo`, but records every `event` the socket receives from the very first,
 * which can arrive right behind the connection itself.
 */
export async function connectRecording<E extends keyof ServerToClientEvents>(
  port: number,
  event: E,
): Promise<{ socket: TestSocket; heard: Payload<E>[] }> {
  const socket: TestSocket = io(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    autoConnect: false,
  })
  const heard: Payload<E>[] = []
  const name: string = event
  untyped(socket).on(name, (payload: Payload<E>) => heard.push(payload))
  socket.connect()
  await whenConnected(socket)
  return { socket, heard }
}

function whenConnected(socket: TestSocket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('connect_error', reject)
  })
}

/** Resolves with the next `event` the socket receives that `matches`. */
export function nextEvent<E extends keyof ServerToClientEvents>(
  socket: TestSocket,
  event: E,
  matches: (payload: Payload<E>) => boolean = () => true,
): Promise<Payload<E>> {
  // Socket.IO can't type a listener for an event name that is itself generic, so the listener
  // goes on the untyped socket, under the name as a plain string.
  const anyEvent = untyped(socket)
  const name: string = event
  return new Promise((resolve) => {
    const listener = (payload: Payload<E>) => {
      if (!matches(payload)) return
      anyEvent.off(name, listener)
      resolve(payload)
    }
    anyEvent.on(name, listener)
  })
}

/**
 * Opens a raw WebSocket to the app, then stops reading from it, like a client whose machine went
 * to sleep: it never answers anything again, not even a request to close.
 */
export async function openSilentWebSocket(port: number): Promise<TcpSocket> {
  const socket = connectTcp(port, '127.0.0.1')
  await once(socket, 'connect')
  socket.write(
    [
      'GET /socket.io/?EIO=4&transport=websocket HTTP/1.1',
      `Host: 127.0.0.1:${port}`,
      `Origin: http://127.0.0.1:${port}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Version: 13',
      `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}`,
      '',
      '',
    ].join('\r\n'),
  )
  // A refused handshake would leave nothing to stall a shutdown, and a test using this helper
  // would pass without testing anything.
  const [response] = (await once(socket, 'data')) as [Buffer]
  const statusLine = response.toString('latin1').split('\r\n', 1)[0] ?? ''
  if (!statusLine.startsWith('HTTP/1.1 101')) {
    throw new Error(`The server refused the WebSocket: ${statusLine}`)
  }
  socket.pause()
  return socket
}

/** The same socket without event types, to send what a well-behaved client never would. */
export function untyped(socket: TestSocket): Socket {
  return socket
}
