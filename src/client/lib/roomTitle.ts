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

/**
 * A room's name with its number, such as "Picnic (Chatroom 9)", for wherever the number isn't
 * shown next to it: a pin, a notice, a dialog. A name can copy another room's, but not its number.
 */
export function roomLabel(room: Pick<Room, 'id' | 'name'>): string {
  const number = defaultRoomTitle(room.id)
  return room.name === null ? number : `${room.name} (${number})`
}
