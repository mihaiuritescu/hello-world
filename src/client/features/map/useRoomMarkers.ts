import type { Room } from '#shared/domain.ts'
import L from 'leaflet'
import { onBeforeUnmount, watch, type Ref, type ShallowRef } from 'vue'
import { roomLabel } from '../../lib/roomTitle.ts'
import { clusterIcon } from './clusterIcon.ts'
import { clusterRooms, type RoomGroup } from './clusterRooms.ts'
import { pinIcon } from './pinIcon.ts'

const ACTIVE_CLASS = 'room-pin--active'
/** Pins closer than this on screen, in pixels, merge into one counted circle. */
const CLUSTER_RADIUS_PX = 40
/** The margin left around a circle's rooms once the map has zoomed in on them, in pixels. */
const ZOOM_PADDING_PX = 64
/** The least room, in pixels, that keeping clear of the panel may leave for a circle's rooms. */
const MIN_FREE_PX = 120

/**
 * Keeps the listed rooms on the map: a pin for a room on its own, and a counted circle for rooms
 * whose pins would overlap at the current zoom. The open room's pin is highlighted and never
 * merges. Nothing merges at the deepest zoom, where zooming in could no longer separate pins.
 * `cover` is what floats over the map, the chat panel: zooming in keeps rooms out from under it.
 */
export function useRoomMarkers(
  map: Readonly<ShallowRef<L.Map | null>>,
  rooms: Readonly<Ref<readonly Room[]>>,
  selectedRoomId: Readonly<Ref<number | null>>,
  onSelect: (roomId: number) => void,
  cover: Readonly<Ref<HTMLElement | null | undefined>>,
) {
  // Plain, non-reactive state: Leaflet objects must stay out of Vue's reactivity.
  /** One pin per listed room, made the first time the room is drawn on its own, then reused. */
  const pins = new Map<number, L.Marker>()
  /** The circles on the map, by their rooms' ids: an unchanged group keeps its marker, and focus. */
  const circles = new Map<string, L.Marker>()
  let activeId: number | null = null
  let zoomWatched: L.Map | null = null
  /** The room whose marker takes the keyboard focus once a zoom into its circle settles. */
  let focusAfterZoom: number | null = null

  function sync(): void {
    const instance = map.value
    if (!instance) return
    if (zoomWatched !== instance) {
      instance.on('zoomend', onZoomEnd)
      zoomWatched = instance
    }

    // The store keeps only the newest rooms, so a room can leave the list.
    const listed = new Set(rooms.value.map((room) => room.id))
    for (const [id, pin] of pins) {
      if (listed.has(id)) continue
      pin.remove()
      pins.delete(id)
    }

    const drawnPins = new Set<number>()
    const drawnCircles = new Set<string>()
    for (const group of groupsAt(instance)) {
      const [first, second] = group.rooms
      if (first && !second) {
        drawPin(instance, first)
        drawnPins.add(first.id)
      } else {
        drawnCircles.add(drawCircle(instance, group))
      }
    }
    for (const [id, pin] of pins) {
      if (!drawnPins.has(id)) pin.remove()
    }
    for (const [key, circle] of circles) {
      if (drawnCircles.has(key)) continue
      circle.remove()
      circles.delete(key)
    }
    highlight(selectedRoomId.value)
  }

  // A circle zoomed into with Enter is gone, or smaller, once the zoom settles. The focus moves on
  // to its first room's marker, so the next Enter opens a room or zooms on: on the map itself, it
  // would create a room (FR-2).
  function onZoomEnd(): void {
    sync()
    if (focusAfterZoom === null) return
    markerOf(focusAfterZoom)?.getElement()?.focus()
    focusAfterZoom = null
  }

  /** The marker that shows a room now: its pin, or the circle it's in. */
  function markerOf(roomId: number): L.Marker | undefined {
    const pin = pins.get(roomId)
    if (pin && map.value?.hasLayer(pin)) return pin
    for (const [key, circle] of circles) {
      if (key.split(',').includes(String(roomId))) return circle
    }
    return undefined
  }

  function groupsAt(instance: L.Map): RoomGroup[] {
    const zoom = instance.getZoom()
    const radius = zoom >= instance.getMaxZoom() ? 0 : CLUSTER_RADIUS_PX
    return clusterRooms(
      rooms.value,
      (room) => instance.project([room.lat, room.lng], zoom),
      radius,
      selectedRoomId.value,
    )
  }

  function drawPin(instance: L.Map, room: Room): void {
    let pin = pins.get(room.id)
    if (pin) {
      setTitle(pin, roomLabel(room))
    } else {
      pin = createPin(room)
      pins.set(room.id, pin)
    }
    if (!instance.hasLayer(pin)) pin.addTo(instance)
  }

  /**
   * Gives a pin its room's new name. Leaflet reads `title` and `alt` only when it makes the pin's
   * image, so the image on the map is renamed directly, through DOM properties: a name is never
   * parsed as HTML (I7).
   */
  function setTitle(pin: L.Marker, title: string): void {
    if (pin.options.title === title) return
    pin.options.title = title
    pin.options.alt = title
    const image = pin.getElement()
    if (image instanceof HTMLImageElement) {
      image.title = title
      image.alt = title
    }
  }

  function createPin(room: Room): L.Marker {
    // Pins are where rooms are picked, so a renamed room keeps its number in the name they read.
    const title = roomLabel(room)
    return L.marker([room.lat, room.lng], { icon: pinIcon, title, alt: title, keyboard: true })
      .on('click', () => onSelect(room.id))
      .on('keydown', (event: L.LeafletKeyboardEvent) => {
        // keyboard: true makes the pin focusable; Leaflet leaves Enter to us.
        if (event.originalEvent.key === 'Enter') onSelect(room.id)
      })
  }

  /** Puts a group's circle on the map, or keeps the one already there, and returns its key. */
  function drawCircle(instance: L.Map, group: RoomGroup): string {
    const key = group.rooms.map((room) => room.id).join(',')
    if (circles.has(key)) return key

    // The same rooms always average to the same place, whatever the zoom they're grouped at.
    const center = instance.unproject(L.point(group.center.x, group.center.y), instance.getZoom())
    const count = group.rooms.length
    const circle = L.marker(center, {
      icon: clusterIcon(count),
      title: `${count} chatrooms`,
      keyboard: true,
    })
      .on('click', (event: L.LeafletMouseEvent) => {
        // A double-click's second click would zoom in again, past what the first one chose.
        if (event.originalEvent.detail <= 1) zoomTo(instance, group.rooms)
      })
      .on('keydown', (event: L.LeafletKeyboardEvent) => {
        if (event.originalEvent.key !== 'Enter') return
        focusAfterZoom = group.rooms[0]?.id ?? null
        zoomTo(instance, group.rooms)
      })
      .addTo(instance)
    circles.set(key, circle)
    return key
  }

  /**
   * Zooms in on a circle's rooms: at least one level, so every click gets closer, and as far as
   * fits them all in the part of the map the panel leaves free. Rooms that still overlap there
   * stay in a smaller circle. Rooms that share one spot fit at any zoom, so they get the deepest,
   * where nothing merges.
   */
  function zoomTo(instance: L.Map, groupRooms: readonly Room[]): void {
    const bounds = L.latLngBounds(groupRooms.map((room) => L.latLng(room.lat, room.lng)))
    const { topLeft, bottomRight } = freeAreaPadding(instance)
    const fitting = instance.getBoundsZoom(bounds, false, topLeft.add(bottomRight))
    const zoom = Math.min(
      instance.getMaxZoom(),
      Math.max(instance.getZoom() + 1, Number.isFinite(fitting) ? fitting : 0),
    )
    // Centred in the free area, as Leaflet's own fitBounds centres between its paddings.
    const middle = instance
      .project(bounds.getSouthWest(), zoom)
      .add(instance.project(bounds.getNorthEast(), zoom))
      .divideBy(2)
      .add(bottomRight.subtract(topLeft).divideBy(2))
    instance.setView(instance.unproject(middle, zoom), zoom)
  }

  /**
   * The paddings that keep zoomed-in rooms away from the map's edges and from under the panel:
   * left of it when it sits on the right, as on a wide screen, and below it when it spans the
   * map's width, as on a phone. The panel is ignored when avoiding it would leave too little room.
   */
  function freeAreaPadding(instance: L.Map): { topLeft: L.Point; bottomRight: L.Point } {
    const margin = L.point(ZOOM_PADDING_PX, ZOOM_PADDING_PX)
    const padding = { topLeft: margin, bottomRight: margin }
    const panel = cover.value?.getBoundingClientRect()
    if (!panel) return padding
    const area = instance.getContainer().getBoundingClientRect()
    if (panel.left > area.left + area.width / 2) {
      const right = area.right - panel.left + ZOOM_PADDING_PX
      if (area.width - right - ZOOM_PADDING_PX >= MIN_FREE_PX) {
        padding.bottomRight = L.point(right, ZOOM_PADDING_PX)
      }
    } else {
      const top = panel.bottom - area.top + ZOOM_PADDING_PX
      if (area.height - top - ZOOM_PADDING_PX >= MIN_FREE_PX) {
        padding.topLeft = L.point(ZOOM_PADDING_PX, top)
      }
    }
    return padding
  }

  function highlight(roomId: number | null): void {
    setActive(activeId, false)
    setActive(roomId, true)
    activeId = roomId
  }

  // A pin drawn again gets a new element from Leaflet, so every sync applies the class anew.
  function setActive(roomId: number | null, active: boolean): void {
    const pin = roomId === null ? undefined : pins.get(roomId)
    if (!pin) return
    pin.getElement()?.classList.toggle(ACTIVE_CLASS, active)
    pin.setZIndexOffset(active ? 1000 : 0)
  }

  // One watcher, so a room created and selected in the same tick gets its pin before the
  // highlight. It watches the list itself, not its length: at the cap, a new room replaces the
  // oldest and the count stays the same.
  watch([map, rooms, selectedRoomId], sync, { immediate: true })
  onBeforeUnmount(() => {
    pins.clear()
    circles.clear()
  })
}
