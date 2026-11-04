import type { Room } from '#shared/domain.ts'
import { within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { ApiError, requestJson } from '../../lib/http.ts'
import { createAppVuetify } from '../../plugins/vuetify.ts'
import { useRoomsStore } from '../../stores/rooms.ts'
import { useSessionStore } from '../../stores/session.ts'
import RoomHeader from './RoomHeader.vue'

vi.mock('../../lib/http.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/http.ts')>()),
  requestJson: vi.fn(),
}))
vi.mock('../../lib/socket.ts', () => ({ connectSocket: vi.fn() }))
const requestJsonMock = vi.mocked(requestJson)

function room(id: number, changes: Partial<Room> = {}): Room {
  return {
    id,
    lat: 1,
    lng: 2,
    name: null,
    revision: 0,
    createdAt: '2026-11-04T10:00:00.000Z',
    ...changes,
  }
}

/**
 * Renders the header of an open room. As in the app, the room comes from the rooms store, so the
 * header shows a new name once the store has it. `created` makes this browser the room's creator.
 */
function renderHeader(open: Room, { created = false } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const rooms = useRoomsStore()
  rooms.upsert(open)
  if (created) useSessionStore().rememberOwnerToken(open.id, `token-${open.id}`)
  const Host = defineComponent({
    setup: () => () => h(RoomHeader, { room: rooms.byId.get(open.id) ?? open }),
  })
  mount(Host, { global: { plugins: [pinia, createAppVuetify()] }, attachTo: document.body })
  return { screen: within(document.body), user: userEvent.setup() }
}

function patchCalls() {
  return requestJsonMock.mock.calls.filter(([, options]) => options?.method === 'PATCH')
}

enableAutoUnmount(afterEach)

describe('RoomHeader', () => {
  beforeEach(() => {
    localStorage.clear()
    requestJsonMock.mockReset()
  })

  it('shows a named room by its name, with its number underneath', () => {
    const { screen } = renderHeader(room(7, { name: 'Picnic' }))

    expect(screen.getByRole('heading', { level: 2, name: 'Picnic' })).toBeVisible()
    expect(screen.getByText('Chatroom 7')).toBeVisible()
  })

  it('shows a room without a name as "Chatroom N", once', () => {
    const { screen } = renderHeader(room(7))

    expect(screen.getByRole('heading', { level: 2, name: 'Chatroom 7' })).toBeVisible()
    expect(screen.getAllByText('Chatroom 7')).toHaveLength(1)
  })

  it('shows a name with markup as plain text, which runs nothing', () => {
    const name = '<img src=x onerror=alert(1)>'
    const { screen } = renderHeader(room(7, { name }))

    expect(screen.getByRole('heading', { level: 2 }).textContent?.trim()).toBe(name)
    expect(document.body.querySelector('img, [onerror]')).toBeNull()
  })

  it('offers renaming only to the browser that created the room', () => {
    const { screen } = renderHeader(room(7))

    expect(screen.queryByRole('button', { name: 'Rename this room' })).not.toBeInTheDocument()
  })

  it('renames the room, then gives the focus back to the rename button', async () => {
    const { screen, user } = renderHeader(room(7), { created: true })
    requestJsonMock.mockResolvedValue(room(7, { name: 'Picnic', revision: 1 }))

    await user.click(screen.getByRole('button', { name: 'Rename this room' }))
    const field = screen.getByRole('textbox', { name: 'Room name' })
    expect(field).toHaveFocus()
    await user.type(field, 'Picnic{Enter}')
    await flushPromises()

    expect(patchCalls()).toEqual([
      [
        '/api/rooms/7',
        {
          method: 'PATCH',
          body: { name: 'Picnic' },
          headers: { authorization: 'Bearer token-7' },
        },
      ],
    ])
    expect(screen.getByRole('heading', { level: 2, name: 'Picnic' })).toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Room name' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename this room' })).toHaveFocus()
  })

  it('starts from the current name, and an emptied name brings back the default', async () => {
    const { screen, user } = renderHeader(room(7, { name: 'Picnic' }), { created: true })
    requestJsonMock.mockResolvedValue(room(7, { revision: 2 }))

    await user.click(screen.getByRole('button', { name: 'Rename this room' }))
    const field = screen.getByRole('textbox', { name: 'Room name' })
    expect(field).toHaveValue('Picnic')
    await user.clear(field)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await flushPromises()

    expect(patchCalls()[0]?.[1]).toMatchObject({ body: { name: null } })
    expect(screen.getByRole('heading', { level: 2, name: 'Chatroom 7' })).toBeVisible()
  })

  it('stops renaming on Escape, without sending anything', async () => {
    const { screen, user } = renderHeader(room(7), { created: true })

    await user.click(screen.getByRole('button', { name: 'Rename this room' }))
    await user.type(screen.getByRole('textbox', { name: 'Room name' }), 'Picnic{Escape}')

    expect(screen.queryByRole('textbox', { name: 'Room name' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Chatroom 7' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Rename this room' })).toHaveFocus()
    expect(patchCalls()).toEqual([])
  })

  it("says why a name can't be used, and won't send it", async () => {
    const { screen, user } = renderHeader(room(7), { created: true })

    await user.click(screen.getByRole('button', { name: 'Rename this room' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Room name' }),
      `${String.fromCodePoint(0x202e)}cinciP`,
    )

    expect(screen.getByText("Text direction controls aren't allowed.")).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it.each([
    [
      'a rate limit',
      new ApiError(429, 'RATE_LIMITED', 'Too many requests.'),
      "You're renaming rooms too fast. Wait a minute, then try again.",
    ],
    [
      'a token it no longer accepts',
      new ApiError(403, 'NOT_ROOM_OWNER', 'Not yours.'),
      'Only the browser that created this room can rename it.',
    ],
    ['a lost connection', new Error('offline'), "Couldn't rename the room. Please try again."],
  ])('says so when a rename fails on %s, and keeps the name typed', async (_case, error, text) => {
    const { screen, user } = renderHeader(room(7), { created: true })
    requestJsonMock.mockRejectedValue(error)

    await user.click(screen.getByRole('button', { name: 'Rename this room' }))
    await user.type(screen.getByRole('textbox', { name: 'Room name' }), 'Picnic{Enter}')
    await flushPromises()

    expect(screen.getByText(text)).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Room name' })).toHaveValue('Picnic')
  })
})
