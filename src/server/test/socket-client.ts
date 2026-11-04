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

export interface RawSocketIo {
  /** Sends these Engine.IO packets in one TCP write, as a single burst. */
  send(packets: string[]): void
  /** The text of every frame the server sent so far, such as `0{…}` (open) or `40{…}` (connected). */
  received: string[]
  close(): void
}

/**
 * A raw Socket.IO client over a WebSocket, to send what socket.io-client never would, such as a
 * burst of packets in one TCP write. It masks its frames, as the protocol requires of clients, and
 * resolves once the server's open packet has arrived.
 */
export async function openRawSocketIo(port: number): Promise<RawSocketIo> {
  const socket = connectTcp(port, '127.0.0.1')
  await once(socket, 'connect')
  const received: string[] = []
  let pending: Buffer = Buffer.alloc(0)
  let upgraded = false
  const opened = new Promise<void>((resolve, reject) => {
    socket.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk])
      if (!upgraded) {
        const end = pending.indexOf('\r\n\r\n')
        if (end === -1) return
        const statusLine = pending.subarray(0, end).toString('latin1').split('\r\n', 1)[0] ?? ''
        if (!statusLine.startsWith('HTTP/1.1 101')) {
          reject(new Error(`The server refused the WebSocket: ${statusLine}`))
          return
        }
        upgraded = true
        pending = pending.subarray(end + 4)
      }
      pending = readFrames(pending, received)
      if (received[0]?.startsWith('0')) resolve()
    })
  })
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
  await opened
  return {
    send: (packets) => socket.write(Buffer.concat(packets.map(maskedTextFrame))),
    received,
    close: () => socket.destroy(),
  }
}

/** Reads the complete frames at the start of `data` into `texts`, and returns what's left. */
function readFrames(data: Buffer, texts: string[]): Buffer {
  let rest = data
  while (rest.length >= 2) {
    // Server frames are never masked. These tests only get short ones: 7- or 16-bit lengths.
    let length = (rest[1] ?? 0) & 0x7f
    let start = 2
    if (length === 126) {
      if (rest.length < 4) break
      length = rest.readUInt16BE(2)
      start = 4
    } else if (length === 127) {
      throw new Error('A frame this long is not expected in these tests')
    }
    if (rest.length < start + length) break
    const isText = ((rest[0] ?? 0) & 0x0f) === 1
    if (isText) texts.push(rest.subarray(start, start + length).toString('utf8'))
    rest = rest.subarray(start + length)
  }
  return rest
}

function maskedTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8')
  if (payload.length >= 126) throw new Error('Only short frames are supported')
  const mask = randomBytes(4)
  const frame = Buffer.alloc(6 + payload.length)
  frame[0] = 0x81 // the final frame of a text message
  frame[1] = 0x80 | payload.length // masked, then the length
  mask.copy(frame, 2)
  payload.forEach((byte, index) => (frame[6 + index] = byte ^ (mask[index % 4] ?? 0)))
  return frame
}

/** The same socket without event types, to send what a well-behaved client never would. */
export function untyped(socket: TestSocket): Socket {
  return socket
}
