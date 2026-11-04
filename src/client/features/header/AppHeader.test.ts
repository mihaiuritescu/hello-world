import { within } from '@testing-library/dom'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createAppVuetify } from '../../plugins/vuetify.ts'
import { useRealtimeStore } from '../../stores/realtime.ts'
import AppHeader from './AppHeader.vue'

vi.mock('../../lib/socket.ts', () => ({ connectSocket: vi.fn() }))

function renderHeader() {
  mount(AppHeader, {
    global: { plugins: [createPinia(), createAppVuetify()] },
    attachTo: document.body,
  })
  return within(document.body)
}

enableAutoUnmount(afterEach)

describe('AppHeader', () => {
  it("names the app in the page's banner and says what it does", () => {
    const screen = renderHeader()

    const banner = screen.getByRole('banner')
    expect(within(banner).getByRole('heading', { level: 1, name: 'Hello World' })).toBeVisible()
    expect(banner).toHaveTextContent(
      'Drop a pin anywhere on the map and chat with whoever joins you.',
    )
  })

  it('shows how many windows have the app open once the server has said', async () => {
    const screen = renderHeader()
    expect(screen.queryByText(/online/)).not.toBeInTheDocument()

    useRealtimeStore().online = 3
    await nextTick()

    expect(screen.getByRole('banner')).toHaveTextContent('3 online')
  })

  it('hides the count again once it is no longer known', async () => {
    const screen = renderHeader()
    const realtime = useRealtimeStore()
    realtime.online = 2
    await nextTick()

    realtime.online = null
    await nextTick()

    expect(screen.queryByText(/online/)).not.toBeInTheDocument()
  })
})
