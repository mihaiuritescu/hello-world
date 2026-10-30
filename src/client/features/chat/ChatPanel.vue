<template>
  <v-card tag="aside" class="chat-panel" aria-label="Chat" elevation="8" rounded="lg">
    <v-card-text>
      <p class="text-body-1">Click on the map to start a chat</p>
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
