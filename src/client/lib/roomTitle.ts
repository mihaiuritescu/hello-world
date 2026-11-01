import type { Room } from '#shared/domain.ts'

/** The name a room shows in the panel and on its pin, as in the mockups. */
export function roomTitle(room: Pick<Room, 'id'>): string {
  return `Chatroom ${room.id}`
}
