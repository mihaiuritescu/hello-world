import type { Message, Room } from '#shared/domain.ts'
import { within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestJson } from '../../lib/http.ts'
import { createAppVuetify } from '../../plugins/vuetify.ts'
import { deferred } from '../../test/deferred.ts'
import ChatPanel from './ChatPanel.vue'

vi.mock('../../lib/http.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/http.ts')>()),
  requestJson: vi.fn(),
}))
const requestJsonMock = vi.mocked(requestJson)

function room(id: number): Room {
  return { id, lat: 1, lng: 2, createdAt: '2026-11-02T10:00:00.000Z' }
}

const message: Message = {
  id: 1,
  roomId: 7,
  authorName: 'Alice',
  body: 'Hello, world',
  createdAt: '2026-11-02T10:00:00.000Z',
}

function renderPanel(openRoom: Room | null) {
  const wrapper = mount(ChatPanel, {
    props: { room: openRoom },
    global: { plugins: [createPinia(), createAppVuetify()] },
    attachTo: document.body,
  })
  return { wrapper, screen: within(document.body) }
}

enableAutoUnmount(afterEach)

describe('ChatPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    requestJsonMock.mockReset()
    requestJsonMock.mockResolvedValue({ messages: [] })
  })

  it('invites the user to click on the map, or press Enter on it, when no room is open', () => {
    const { screen } = renderPanel(null)

    const panel = screen.getByRole('complementary', { name: 'Chat' })
    expect(panel).toHaveTextContent('Click on the map to start a chat')
    expect(panel).toHaveTextContent('or focus the map and press Enter')
    expect(requestJsonMock).not.toHaveBeenCalled()
  })

  it('shows the open room as "Chatroom N"', () => {
    const { screen } = renderPanel(room(7))

    expect(screen.getByRole('heading', { name: 'Chatroom 7' })).toBeVisible()
    expect(screen.queryByText('Click on the map to start a chat')).not.toBeInTheDocument()
  })

  it("loads the open room's messages and lists them", async () => {
    requestJsonMock.mockResolvedValue({ messages: [message] })
    const { screen } = renderPanel(room(7))
    await flushPromises()

    expect(requestJsonMock).toHaveBeenCalledWith('/api/rooms/7/messages')
    expect(screen.getByRole('listitem')).toHaveTextContent('Hello, world')
  })

  it('loads the messages of each room it opens', async () => {
    const { wrapper } = renderPanel(room(7))

    await wrapper.setProps({ room: room(8) })
    await flushPromises()

    expect(requestJsonMock).toHaveBeenLastCalledWith('/api/rooms/8/messages')
  })

  it('reloads a room each time it opens, so messages posted meanwhile appear', async () => {
    const later: Message = { ...message, id: 2, body: 'See you at 6' }
    requestJsonMock
      .mockResolvedValueOnce({ messages: [message] })
      .mockResolvedValueOnce({ messages: [] })
      .mockResolvedValueOnce({ messages: [message, later] })
    const { wrapper, screen } = renderPanel(room(7))
    await flushPromises()

    await wrapper.setProps({ room: room(8) })
    await flushPromises()
    await wrapper.setProps({ room: room(7) })
    await flushPromises()

    const room7Loads = requestJsonMock.mock.calls.filter(
      ([path]) => path === '/api/rooms/7/messages',
    )
    expect(room7Loads).toHaveLength(2)
    expect(screen.getByText('See you at 6')).toBeInTheDocument()
  })

  it('keeps a draft whose send fails after another room opens, with its error', async () => {
    const send = deferred<Message>()
    requestJsonMock.mockImplementation((_path: string, options?: { method?: string }) =>
      options?.method === 'POST' ? send.promise : Promise.resolve({ messages: [] }),
    )
    const user = userEvent.setup()
    const { wrapper, screen } = renderPanel(room(7))
    await user.type(screen.getByRole('textbox', { name: 'User name' }), 'Alice')
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'See you at 6')
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    await wrapper.setProps({ room: room(8) })
    send.reject(new Error('offline'))
    await flushPromises()
    await wrapper.setProps({ room: room(7) })
    await flushPromises()

    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('See you at 6')
    expect(screen.getByText("Couldn't send the message. Please try again.")).toBeVisible()
  })
})
