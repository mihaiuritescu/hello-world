import L from 'leaflet'
import { describe, expect, it } from 'vitest'
import { toRoomCoordinates } from './coordinates.ts'

describe('toRoomCoordinates', () => {
  it('returns plain coordinates for a point on the map', () => {
    expect(toRoomCoordinates(L.latLng(46.77, 23.59))).toEqual({ lat: 46.77, lng: 23.59 })
  })

  it('ignores the grey margin east and west of the one world the map shows', () => {
    expect(toRoomCoordinates(L.latLng(47, 200))).toBeNull()
    expect(toRoomCoordinates(L.latLng(47, -180.5))).toBeNull()
    expect(toRoomCoordinates(L.latLng(47, 180))).toEqual({ lat: 47, lng: 180 })
  })

  it('ignores the grey area beyond the latitudes the map can draw', () => {
    expect(toRoomCoordinates(L.latLng(86.4, 10))).toBeNull()
    expect(toRoomCoordinates(L.latLng(-86.4, 10))).toBeNull()
  })
})
