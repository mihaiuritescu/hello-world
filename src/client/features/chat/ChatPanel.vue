<script setup lang="ts">
import type { Room } from '#shared/domain.ts'
import { roomTitle } from '../../lib/roomTitle.ts'

defineProps<{ room: Room | null }>()
</script>

<template>
  <v-card tag="aside" class="chat-panel" aria-label="Chat" elevation="8" rounded="lg">
    <v-card-title v-if="room" tag="h2">{{ roomTitle(room) }}</v-card-title>
    <v-card-text v-else>
      <p class="text-body-1">Click on the map to start a chat</p>
      <p class="text-body-2 text-medium-emphasis">or focus the map and press Enter</p>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.chat-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1;
  width: min(360px, calc(100% - 32px));
  /* Stops short of the bottom edge, where the map's attribution must stay visible. */
  max-height: calc(100% - 72px);
}
</style>
