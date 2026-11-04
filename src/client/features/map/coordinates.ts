import type { Coordinates } from '#shared/schemas.ts'
import type L from 'leaflet'

/** Web Mercator can't draw beyond about ±85.05°; the map shows grey there. */
const MAX_DRAWABLE_LATITUDE = 85.0511287798

/**
 * The one world the map shows. Leaflet draws each pin on one copy of the world, so on a repeated
 * copy every pin would be missing, and a room made there would get its pin far out of view.
 */
export const DRAWABLE_WORLD: L.LatLngBoundsLiteral = [
  [-MAX_DRAWABLE_LATITUDE, -180],
  [MAX_DRAWABLE_LATITUDE, 180],
]

/**
 * Plain coordinates for a room at `latlng`. Null for the grey area beyond the drawable world,
 * where a pin would be drawn somewhere else than where the user clicked: north and south of what
 * Web Mercator draws, and east and west of the world, which a screen wider than the world at the
 * lowest zoom leaves in view.
 */
export function toRoomCoordinates(latlng: L.LatLng): Coordinates | null {
  const { lat, lng } = latlng
  return Math.abs(lat) > MAX_DRAWABLE_LATITUDE || Math.abs(lng) > 180 ? null : { lat, lng }
}
