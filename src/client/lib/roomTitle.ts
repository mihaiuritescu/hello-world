import type { Room } from '#shared/domain.ts'

/** The name a room shows in the panel and on its pin: its own, or "Chatroom N". */
export function roomTitle(room: Pick<Room, 'id' | 'name'>): string {
  return room.name ?? defaultRoomTitle(room.id)
}

/**
 * "Chatroom N", as in the mockups: the name of a room nobody has named, and the number a renamed
 * room still shows, so that no name can pass one room off as another.
 */
export function defaultRoomTitle(roomId: number): string {
  return `Chatroom ${roomId}`
}
