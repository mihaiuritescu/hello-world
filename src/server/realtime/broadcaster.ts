import type { Message, Room } from '#shared/domain.ts'

/**
 * Announces committed changes to connected clients. Routes depend only on this interface, so
 * the transport (Socket.IO, and a Valkey adapter when there are several instances) can change
 * without touching them.
 */
export interface Broadcaster {
  roomCreated(room: Room): void
  roomUpdated(room: Room): void
  roomDeleted(roomId: number): void
  messageCreated(message: Message): void
}

/** Announces nothing. For tests that ignore announcements, or replace only one of them. */
export const silentBroadcaster: Broadcaster = {
  roomCreated: () => {},
  roomUpdated: () => {},
  roomDeleted: () => {},
  messageCreated: () => {},
}
