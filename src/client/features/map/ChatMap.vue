<script setup lang="ts">
import type { Room } from '#shared/domain.ts'
import type { Coordinates } from '#shared/schemas.ts'
import { toRef, useTemplateRef } from 'vue'
import { useLeafletMap } from './useLeafletMap.ts'
import { useRoomMarkers } from './useRoomMarkers.ts'

const props = defineProps<{
  rooms: readonly Room[]
  selectedRoomId: number | null
}>()

const emit = defineEmits<{
  createAt: [coordinates: Coordinates]
  select: [roomId: number]
}>()

const container = useTemplateRef<HTMLDivElement>('container')
const { map, zoom } = useLeafletMap(container, (coordinates) => emit('createAt', coordinates))
useRoomMarkers(map, toRef(props, 'rooms'), toRef(props, 'selectedRoomId'), (roomId) =>
  emit('select', roomId),
)
</script>

<template>
  <section class="chat-map" aria-label="World map" :data-zoom="zoom">
    <div ref="container" class="chat-map__canvas" />
  </section>
</template>

<style scoped>
.chat-map,
.chat-map__canvas {
  height: 100%;
}

/* Keeps Leaflet's internal z-indexes (up to 1000) inside the map, below the chat panel. */
.chat-map__canvas {
  isolation: isolate;
}
</style>
