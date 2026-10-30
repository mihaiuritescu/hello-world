<script setup lang="ts">
import ChatMap from './features/map/ChatMap.vue'
import ChatPanel from './features/chat/ChatPanel.vue'
</script>

<template>
  <v-app>
    <v-main>
      <!-- The panel is a sibling of the map, never inside it, so its clicks never reach Leaflet. -->
      <div class="map-shell">
        <ChatMap />
        <ChatPanel />
      </div>
    </v-main>
  </v-app>
</template>

<style scoped>
.map-shell {
  position: relative;
  height: 100dvh;
}
</style>
