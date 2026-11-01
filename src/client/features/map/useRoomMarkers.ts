import type { Room } from '#shared/domain.ts'
import L from 'leaflet'
import { onBeforeUnmount, watch, type Ref, type ShallowRef } from 'vue'
import { roomTitle } from '../../lib/roomTitle.ts'
import { pinIcon } from './pinIcon.ts'

const ACTIVE_CLASS = 'room-pin--active'

/**
 * Keeps one pin per room on the map and highlights the open room's pin. Rooms are only ever
 * added, so pins are only ever added too.
 */
export function useRoomMarkers(
  map: Readonly<ShallowRef<L.Map | null>>,
  rooms: Readonly<Ref<readonly Room[]>>,
  selectedRoomId: Readonly<Ref<number | null>>,
  onSelect: (roomId: number) => void,
) {
  // Plain, non-reactive state: Leaflet objects must stay out of Vue's reactivity.
  const markers = new Map<number, L.Marker>()
  let activeId: number | null = null

  function sync(): void {
    const instance = map.value
    if (!instance) return

    for (const room of rooms.value) {
      if (!markers.has(room.id)) markers.set(room.id, createMarker(room).addTo(instance))
    }
    highlight(selectedRoomId.value)
  }

  function createMarker(room: Room): L.Marker {
    const title = roomTitle(room)
    return L.marker([room.lat, room.lng], { icon: pinIcon, title, alt: title, keyboard: true })
      .on('click', () => onSelect(room.id))
      .on('keydown', (event: L.LeafletKeyboardEvent) => {
        // keyboard: true makes the pin focusable; Leaflet leaves Enter to us.
        if (event.originalEvent.key === 'Enter') onSelect(room.id)
      })
  }

  function highlight(roomId: number | null): void {
    setActive(activeId, false)
    setActive(roomId, true)
    activeId = roomId
  }

  function setActive(roomId: number | null, active: boolean): void {
    const marker = roomId === null ? undefined : markers.get(roomId)
    if (!marker) return
    marker.getElement()?.classList.toggle(ACTIVE_CLASS, active)
    marker.setZIndexOffset(active ? 1000 : 0)
  }

  // One watcher, so a room created and selected in the same tick gets its pin before the highlight.
  watch([map, () => rooms.value.length, selectedRoomId], sync, { immediate: true })
  onBeforeUnmount(() => markers.clear())
}
