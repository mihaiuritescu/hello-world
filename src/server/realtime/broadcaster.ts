import type { Room } from '#shared/domain.ts'

/**
 * Announces committed changes to connected clients. Routes depend only on this interface, so
 * the transport (Socket.IO, and a Valkey adapter when there are several instances) can change
 * without touching them.
 */
export interface Broadcaster {
  roomCreated(room: Room): void
}

/** Announces nothing. Used until real-time delivery exists, and by tests that ignore events. */
export const silentBroadcaster: Broadcaster = {
  roomCreated: () => {},
}
