import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'

/**
 * Vuetify with SVG icons from @mdi/js, so no icon font is downloaded. Components are imported
 * automatically by vite-plugin-vuetify. Tests call this too, to render components the same way.
 */
export function createAppVuetify() {
  return createVuetify({
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
    // The light theme matches the mockups. Vuetify would otherwise follow the OS colour scheme,
    // and dark mode is out of scope for v1.
    theme: { defaultTheme: 'light' },
  })
}
