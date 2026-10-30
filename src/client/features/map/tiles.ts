import L from 'leaflet'

// OpenStreetMap's standard tiles: free, no API key, attribution required.
// The tile usage policy asks for light, interactive use and a Referer header on every request.
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export function createTileLayer(): L.TileLayer {
  return L.tileLayer(OSM_TILE_URL, {
    maxZoom: 19,
    attribution: OSM_ATTRIBUTION,
    referrerPolicy: 'strict-origin-when-cross-origin',
  })
}
