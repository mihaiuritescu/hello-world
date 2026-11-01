import type { Coordinates } from '#shared/schemas.ts'
import type L from 'leaflet'

/** Web Mercator can't draw beyond about ±85.05°; the map shows grey there. */
const MAX_DRAWABLE_LATITUDE = 85.0511287798

/**
 * Plain coordinates for a room at `latlng`, with the longitude wrapped into -180..180 after
 * panning across the date line. Null for the grey area beyond the drawable world, where a pin
 * would be drawn somewhere else than where the user clicked.
 */
export function toRoomCoordinates(latlng: L.LatLng): Coordinates | null {
  // wrap() adds floating-point noise (23.59 becomes 23.590000000000003), so wrap only when needed.
  const { lat, lng } = Math.abs(latlng.lng) <= 180 ? latlng : latlng.wrap()
  return Math.abs(lat) > MAX_DRAWABLE_LATITUDE ? null : { lat, lng }
}
