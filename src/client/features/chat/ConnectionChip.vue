<script setup lang="ts">
import { mdiCircle } from '@mdi/js'
import type { ConnectionStatus } from '../../stores/realtime.ts'

defineProps<{ status: ConnectionStatus }>()

const LABELS: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
}
</script>

<template>
  <!-- The text carries the status. The dot adds colour only: Vuetify's green would fail the
       contrast check as text. -->
  <v-chip size="small" variant="outlined" role="status" aria-label="Connection">
    <v-icon
      :icon="mdiCircle"
      :color="status === 'live' ? 'success' : 'warning'"
      size="x-small"
      start
    />
    {{ LABELS[status] }}
  </v-chip>
</template>
