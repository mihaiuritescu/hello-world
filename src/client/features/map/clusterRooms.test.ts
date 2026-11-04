import type { Room } from '#shared/domain.ts'
import { describe, expect, it } from 'vitest'
import { clusterRooms, type ScreenPoint } from './clusterRooms.ts'

/** A room drawn at screen position (x, y): the tests place rooms in pixels directly. */
function room(id: number, x: number, y: number): Room {
  return { id, lat: y, lng: x, createdAt: '2026-11-04T10:00:00.000Z' }
}

const onScreen = (r: Room): ScreenPoint => ({ x: r.lng, y: r.lat })

/** The groups as lists of room ids, which is what most tests check. */
function groupIds(rooms: Room[], radius = 40, apart: number | null = null): number[][] {
  return clusterRooms(rooms, onScreen, radius, apart).map((group) => group.rooms.map((r) => r.id))
}

describe('clusterRooms', () => {
  it('groups the rooms within the radius of the first one', () => {
    expect(groupIds([room(1, 0, 0), room(2, 30, 0), room(3, 0, 40)])).toEqual([[1, 2, 3]])
  })

  it('leaves a room just beyond the radius on its own', () => {
    expect(groupIds([room(1, 0, 0), room(2, 41, 0)])).toEqual([[1], [2]])
  })

  it('measures from the room that starts a group, so a long chain splits', () => {
    expect(groupIds([room(1, 0, 0), room(2, 30, 0), room(3, 60, 0)])).toEqual([[1, 2], [3]])
  })

  it('finds close rooms in neighbouring grid cells, on both sides of zero', () => {
    expect(groupIds([room(1, 39, 0), room(2, 41, 0)])).toEqual([[1, 2]])
    expect(groupIds([room(1, -1, -1), room(2, 1, 1)])).toEqual([[1, 2]])
  })

  it('gives the same groups whatever order the rooms come in', () => {
    const rooms = [room(1, 0, 0), room(2, 30, 0), room(3, 60, 0), room(4, 90, 0)]

    expect(groupIds([...rooms].reverse())).toEqual(groupIds(rooms))
    expect(groupIds(rooms)).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('never puts the room kept apart in a group, even at the same spot', () => {
    expect(groupIds([room(1, 5, 5), room(2, 5, 5), room(3, 5, 5)], 40, 2)).toEqual([[1, 3], [2]])
  })

  it('places a group at the average position of its rooms', () => {
    const [group] = clusterRooms([room(1, 0, 0), room(2, 30, 0), room(3, 0, 30)], onScreen, 40)

    expect(group?.center).toEqual({ x: 10, y: 10 })
  })

  it('groups nothing when the radius is zero, even rooms at the same spot', () => {
    expect(groupIds([room(1, 5, 5), room(2, 5, 5)], 0)).toEqual([[1], [2]])
  })
})
