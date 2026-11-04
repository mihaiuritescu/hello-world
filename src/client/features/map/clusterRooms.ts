import type { Room } from '#shared/domain.ts'

/** A position on screen, in pixels. */
export interface ScreenPoint {
  x: number
  y: number
}

/** Rooms drawn as one marker: a pin for a room on its own, a counted circle for several. */
export interface RoomGroup {
  /** Ordered by id. */
  rooms: Room[]
  /** Where to draw the group: the average screen position of its rooms. */
  center: ScreenPoint
}

interface Placed extends ScreenPoint {
  room: Room
}

/**
 * Groups the rooms whose pins would overlap on screen. Rooms are taken in id order: each room
 * not yet in a group starts one, and takes every free room within `radius` pixels of itself. So
 * the same rooms at the same zoom always give the same groups. The room `apart`, such as the open
 * one, always stays on its own. A radius of zero groups nothing.
 */
export function clusterRooms(
  rooms: readonly Room[],
  toScreen: (room: Room) => ScreenPoint,
  radius: number,
  apart: number | null = null,
): RoomGroup[] {
  const placed: Placed[] = [...rooms]
    .sort((a, b) => a.id - b.id)
    .map((room) => ({ room, ...toScreen(room) }))
  if (radius <= 0) return placed.map((point) => ({ rooms: [point.room], center: point }))

  // Square cells as wide as the radius: every room within the radius of a point lies in the
  // point's own cell or one of the eight around it, so no room is compared with every other.
  const cell = (value: number) => Math.floor(value / radius)
  const cells = new Map<string, Placed[]>()
  for (const point of placed) {
    const key = `${cell(point.x)}:${cell(point.y)}`
    const members = cells.get(key)
    if (members) members.push(point)
    else cells.set(key, [point])
  }

  const grouped = new Set<number>()
  const groups: RoomGroup[] = []
  for (const seed of placed) {
    if (grouped.has(seed.room.id)) continue
    grouped.add(seed.room.id)
    const members = seed.room.id === apart ? [seed] : [seed, ...neighbours(seed)]
    members.sort((a, b) => a.room.id - b.room.id)
    groups.push({ rooms: members.map((member) => member.room), center: average(members) })
  }
  return groups

  /** The free rooms within the radius of `seed`, now taken into its group. */
  function neighbours(seed: Placed): Placed[] {
    const found: Placed[] = []
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const point of cells.get(`${cell(seed.x) + dx}:${cell(seed.y) + dy}`) ?? []) {
          if (grouped.has(point.room.id) || point.room.id === apart) continue
          if (Math.hypot(point.x - seed.x, point.y - seed.y) > radius) continue
          grouped.add(point.room.id)
          found.push(point)
        }
      }
    }
    return found
  }
}

function average(points: ScreenPoint[]): ScreenPoint {
  const sum = points.reduce((total, { x, y }) => ({ x: total.x + x, y: total.y + y }), {
    x: 0,
    y: 0,
  })
  return { x: sum.x / points.length, y: sum.y / points.length }
}
