import type { SubscribeReply } from '#shared/events.ts'
import { vi } from 'vitest'
import type { AppSocket } from '../lib/socket.ts'

interface PendingSubscription {
  roomId: number
  answer: (reply: SubscribeReply) => void
  /** Rejects the subscription, as Socket.IO does when the connection drops before the answer. */
  drop: () => void
}

/**
 * A stand-in for the app's socket. The test plays the server: it raises events with `receive`
 * and answers each subscription by hand, so it controls every ordering.
 */
export function createFakeSocket() {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
  const subscriptions: PendingSubscription[] = []

  const socket = {
    on(event: string, listener: (...args: unknown[]) => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
      return socket
    },
    connect: vi.fn(),
    disconnect: vi.fn((): unknown => socket),
    emitWithAck: (_event: string, { roomId }: { roomId: number }) =>
      new Promise<SubscribeReply>((resolve, reject) => {
        subscriptions.push({
          roomId,
          answer: resolve,
          drop: () => reject(new Error('socket has been disconnected')),
        })
      }),
  }

  return {
    socket: socket as unknown as AppSocket,
    connect: socket.connect,
    disconnect: socket.disconnect,
    subscriptions,
    /** Raises an event, as the server or the connection itself would. */
    receive(event: string, ...args: unknown[]): void {
      listeners.get(event)?.forEach((listener) => listener(...args))
    },
  }
}
