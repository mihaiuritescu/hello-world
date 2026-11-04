import type { Room } from '#shared/domain.ts'
import { within } from '@testing-library/dom'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.vue'
import { ApiError, requestJson } from './lib/http.ts'
import { connectSocket } from './lib/socket.ts'
import { createAppVuetify } from './plugins/vuetify.ts'
import { useSessionStore } from './stores/session.ts'
import { deferred } from './test/deferred.ts'
import { createFakeSocket } from './test/fake-socket.ts'

vi.mock('./lib/http.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/http.ts')>()),
  requestJson: vi.fn(),
}))
vi.mock('./lib/socket.ts', () => ({ connectSocket: vi.fn() }))
const requestJsonMock = vi.mocked(requestJson)

function room(id: number, changes: Partial<Room> = {}): Room {
  return {
    id,
    lat: 1,
    lng: 2,
    name: null,
    revision: 0,
    createdAt: '2026-11-03T10:00:00.000Z',
    ...changes,
  }
}

/** Opens the app at `url`, with the map stubbed: jsdom has no layout for Leaflet. */
async function openApp(url: string, linkedRoom: Promise<Room>) {
  window.history.replaceState(null, '', url)
  requestJsonMock.mockImplementation((path: string) => {
    if (path === '/api/rooms') return Promise.resolve({ rooms: [room(900)] })
    if (path === '/api/rooms/5') return linkedRoom
    return Promise.resolve({ messages: [] })
  })
  mount(App, {
    global: { plugins: [createPinia(), createAppVuetify()], stubs: { ChatMap: true } },
    attachTo: document.body,
  })
  await flushPromises()
  return within(document.body)
}

enableAutoUnmount(afterEach)

describe('App, opening a linked room', () => {
  beforeEach(() => {
    // Vuetify teleports snackbars into the body, where an earlier test's can outlive its app.
    document.body.replaceChildren()
    requestJsonMock.mockReset()
    vi.mocked(connectSocket).mockReset().mockReturnValue(createFakeSocket().socket)
  })

  it('says when the linked room could not be loaded', async () => {
    const screen = await openApp('/?room=5', Promise.reject(new Error('offline')))

    expect(
      await screen.findByText("Couldn't open Chatroom 5. Please reload the page."),
    ).toBeInTheDocument()
  })

  it('asks the user to wait when the server limits the request', async () => {
    const limited = new ApiError(429, 'RATE_LIMITED', 'Too many requests. Try again in 1 minute.')
    const screen = await openApp('/?room=5', Promise.reject(limited))

    expect(
      await screen.findByText(
        'Too many requests from your network just now. Wait a minute, then reload the page to open Chatroom 5.',
      ),
    ).toBeInTheDocument()
  })

  it('says nothing about a linked room that failed after the user picked another', async () => {
    const linked = deferred<Room>()
    const screen = await openApp('/?room=5', linked.promise)

    useSessionStore().selectRoom(900)
    linked.reject(new Error('offline'))
    await flushPromises()

    expect(screen.queryByText(/Couldn't open Chatroom 5/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Chatroom 900' })).toBeInTheDocument()
  })
})
