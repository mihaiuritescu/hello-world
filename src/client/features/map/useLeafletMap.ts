import type { Coordinates } from '#shared/schemas.ts'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import L from 'leaflet'
import { markRaw, onBeforeUnmount, onMounted, ref, shallowRef, type ShallowRef } from 'vue'
import { toRoomCoordinates } from './coordinates.ts'
import { createTileLayer } from './tiles.ts'

/** The opening view: Europe, as in the mockups. */
const INITIAL_CENTER: L.LatLngTuple = [47, 20]
const INITIAL_ZOOM = 5

/**
 * Creates the Leaflet map in `container` on mount and removes it on unmount. `onCreateAt` runs
 * when the user asks for a room: a click, or Enter on the focused map (at its centre).
 *
 * The map lives in a shallowRef and is marked raw: Vue's deep reactive proxies break Leaflet's
 * internals, so no Leaflet object may ever enter reactive state.
 */
export function useLeafletMap(
  container: Readonly<ShallowRef<HTMLElement | null>>,
  onCreateAt: (coordinates: Coordinates) => void,
) {
  const map = shallowRef<L.Map | null>(null)
  /** The zoom level, exposed on the map element for tests and debugging. */
  const zoom = ref(INITIAL_ZOOM)

  onMounted(() => {
    if (!container.value) return

    const instance = markRaw(
      L.map(container.value, {
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        minZoom: 3,
        worldCopyJump: true,
        // Rooms are created on click, and a double-click would also zoom.
        doubleClickZoom: false,
      }),
    )
    instance.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>')
    createTileLayer().addTo(instance)

    instance.on('click', (event: L.LeafletMouseEvent) => {
      // A double-click fires two clicks; only the first one creates a room.
      if (event.originalEvent.detail > 1) return
      const coordinates = toRoomCoordinates(event.latlng)
      if (coordinates) onCreateAt(coordinates)
    })
    // `zoomanim` carries the target level as soon as an animated zoom starts.
    instance.on('zoomanim', (event: L.ZoomAnimEvent) => (zoom.value = event.zoom))
    instance.on('zoomend', () => (zoom.value = instance.getZoom()))
    map.value = instance
  })

  // Keyboard users create a room at the centre with Enter on the map itself, not on a pin in it.
  // A held key repeats, and each repeat would otherwise create another room.
  useEventListener(container, 'keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.repeat || event.target !== container.value) return
    const coordinates = map.value && toRoomCoordinates(map.value.getCenter())
    if (coordinates) onCreateAt(coordinates)
  })

  // Leaflet only tracks window resizes; the container can also change size on its own.
  useResizeObserver(container, () => map.value?.invalidateSize())

  onBeforeUnmount(() => {
    map.value?.remove()
    map.value = null
  })

  return { map, zoom }
}
