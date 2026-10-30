import L from 'leaflet'
import { markRaw, onBeforeUnmount, onMounted, shallowRef, type ShallowRef } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { createTileLayer } from './tiles.ts'

/** The opening view: Europe, as in the mockups. */
const INITIAL_CENTER: L.LatLngTuple = [47, 20]
const INITIAL_ZOOM = 5

/**
 * Creates the Leaflet map in `container` on mount and removes it on unmount.
 *
 * The map lives in a shallowRef and is marked raw: Vue's deep reactive proxies break Leaflet's
 * internals, so no Leaflet object may ever enter reactive state.
 */
export function useLeafletMap(container: Readonly<ShallowRef<HTMLElement | null>>) {
  const map = shallowRef<L.Map | null>(null)

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
    map.value = instance
  })

  // Leaflet only tracks window resizes; the container can also change size on its own.
  useResizeObserver(container, () => map.value?.invalidateSize())

  onBeforeUnmount(() => {
    map.value?.remove()
    map.value = null
  })

  return { map }
}
