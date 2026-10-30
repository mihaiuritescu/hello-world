<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { useLeafletMap } from './useLeafletMap.ts'

const container = useTemplateRef<HTMLDivElement>('container')
useLeafletMap(container)
</script>

<template>
  <section class="chat-map" aria-label="World map">
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
