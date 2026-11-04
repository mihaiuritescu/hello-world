<script setup lang="ts">
import { mdiCircle, mdiEarth } from '@mdi/js'
import { useRealtimeStore } from '../../stores/realtime.ts'

const realtime = useRealtimeStore()
</script>

<template>
  <!-- Outside <main>, so assistive technology finds it as the page's banner. -->
  <v-toolbar tag="header" class="app-header" density="comfortable" color="surface" border="b" flat>
    <v-icon :icon="mdiEarth" color="primary" class="app-header__logo" />
    <div class="app-header__titles">
      <h1 class="text-h6">Hello World</h1>
      <p class="text-body-2 text-medium-emphasis d-none d-sm-block">
        Drop a pin anywhere on the map and chat with whoever joins you.
      </p>
    </div>
    <!-- Not a live region: a count that changes every few seconds would keep interrupting screen
         readers. It's read when reached, like the rest of the header. -->
    <v-chip v-if="realtime.online !== null" class="app-header__online" size="small" variant="tonal">
      <v-icon :icon="mdiCircle" color="success" size="x-small" start />
      {{ realtime.online }} online
    </v-chip>
  </v-toolbar>
</template>

<style scoped>
.app-header__logo {
  margin-inline-start: 16px;
}

.app-header__titles {
  flex: 1 1 auto;
  min-width: 0;
  margin-inline: 12px;
}

.app-header__titles > * {
  overflow: hidden;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-header__online {
  flex: none;
  margin-inline-end: 16px;
}
</style>
