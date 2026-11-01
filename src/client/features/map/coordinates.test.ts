import L from 'leaflet'
import { describe, expect, it } from 'vitest'
import { toRoomCoordinates } from './coordinates.ts'

describe('toRoomCoordinates', () => {
  it('returns plain coordinates for a point on the map', () => {
    expect(toRoomCoordinates(L.latLng(46.77, 23.59))).toEqual({ lat: 46.77, lng: 23.59 })
  })

  it('wraps a longitude from a repeated copy of the world into -180..180', () => {
    expect(toRoomCoordinates(L.latLng(47, 380))).toEqual({ lat: 47, lng: 20 })
  })

  it('ignores the grey area beyond the latitudes the map can draw', () => {
    expect(toRoomCoordinates(L.latLng(86.4, 10))).toBeNull()
    expect(toRoomCoordinates(L.latLng(-86.4, 10))).toBeNull()
  })
})
