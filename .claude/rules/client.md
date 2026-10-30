---
paths:
  - "src/client/**"
---

# Client rules: Vue 3, Vuetify 4 and Leaflet

## Vue
- Components use `<script setup lang="ts">`, with `defineProps<…>()` and `defineEmits<…>()`.
- Server data lives in the Pinia setup stores in `src/client/stores/`. Components read stores and call actions; they never fetch directly.
- Render user text with `{{ }}` only. Never `v-html` (I7).

## Leaflet
- Create the map in `onMounted`, mark it raw (`markRaw`) and hold it in a `shallowRef`. Call `map.remove()` in `onBeforeUnmount`.
- Never put Leaflet objects in `ref()`, `reactive()` or a store: Vue's deep proxies break Leaflet's internals.
- Pass Leaflet plain object literals as options, never reactive objects.
- Markers use the explicit icon from `pinIcon.ts`. Vite inlines Leaflet's marker PNGs, which breaks the default icon path in production builds.

## Layout and styles
- Keep the chat panel a sibling of the map container, never inside it. The map canvas has `isolation: isolate`, which keeps Leaflet's z-indexes below the panel.
- Scoped styles don't reach DOM that Leaflet creates. Put overrides in `styles/global.css`, or use `:deep()`.

## Realtime
- Exactly one socket, owned by the realtime store.
- Bind its events once, and unbind them in `import.meta.hot.dispose`, so HMR never duplicates events.

## Accessibility
- **Inputs:** every input has a visible label. Keep the mockup texts visible with Vuetify's `persistent-placeholder`.
- **Icon-only buttons:** they need an `aria-label`.
