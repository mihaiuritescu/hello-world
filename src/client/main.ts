import 'leaflet/dist/leaflet.css'
import { createAppVuetify } from './plugins/vuetify.ts'
// After Vuetify's styles, so the app's global overrides win.
import './styles/global.css'
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).use(createAppVuetify()).mount('#app')
