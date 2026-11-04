import type { Message, Room } from '#shared/domain.ts'
import { within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestJson } from '../../lib/http.ts'
import { createAppVuetify } from '../../plugins/vuetify.ts'
import { useRoomsStore } from '../../stores/rooms.ts'
import { deferred } from '../../test/deferred.ts'
import ChatPanel from './ChatPanel.vue'

vi.mock('../../lib/http.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/http.ts')>()),
  requestJson: vi.fn(),
}))
const requestJsonMock = vi.mocked(requestJson)

function room(id: number, changes: Partial<Room> = {}): Room {
  return {
    id,
    lat: 1,
    lng: 2,
    name: null,
    revision: 0,
    createdAt: '2026-11-02T10:00:00.000Z',
    ...changes,
  }
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

  it("says when the chatrooms didn't load, and Retry loads them again", async () => {
    requestJsonMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ rooms: [room(1)] })
    const { screen } = renderPanel(null)
    const rooms = useRoomsStore()
    await rooms.load()

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the chatrooms.")

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await flushPromises()

    expect(rooms.list).toEqual([room(1)])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the error and Retry, with its focus, while the chatrooms load again', async () => {
    const reload = deferred<{ rooms: Room[] }>()
    requestJsonMock.mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(reload.promise)
    const { screen } = renderPanel(null)
    const rooms = useRoomsStore()
    await rooms.load()
    const retry = await screen.findByRole('button', { name: 'Retry' })

    await userEvent.click(retry)

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the chatrooms.")
    expect(retry).toBeInTheDocument()
    expect(retry).toHaveFocus()
    reload.resolve({ rooms: [room(1)] })
    await flushPromises()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the open room as "Chatroom N"', () => {
    const { screen } = renderPanel(room(7))

    expect(screen.getByRole('heading', { name: 'Chatroom 7' })).toBeVisible()
    expect(screen.queryByText('Click on the map to start a chat')).not.toBeInTheDocument()
  })

  it('shows the connection status next to the room title', () => {
    const { screen } = renderPanel(room(7))

    expect(screen.getByRole('status', { name: 'Connection' })).toHaveTextContent('Connecting…')
    expect(screen.getByRole('heading', { name: 'Chatroom 7' })).toBeVisible()
  })

  it("loads the open room's messages and lists them", async () => {
    requestJsonMock.mockResolvedValue({ messages: [message] })
    const { screen } = renderPanel(room(7))
    await flushPromises()

    expect(requestJsonMock).toHaveBeenCalledWith('/api/rooms/7/messages')
    expect(screen.getByRole('listitem')).toHaveTextContent('Hello, world')
  })

  it('shows a reopened room as loading, not as it was on the last visit', async () => {
    const reload = deferred<{ messages: Message[] }>()
    requestJsonMock
      .mockResolvedValueOnce({ messages: [] })
      .mockResolvedValueOnce({ messages: [] })
      .mockReturnValueOnce(reload.promise)
    const { wrapper, screen } = renderPanel(room(7))
    await flushPromises()
    expect(screen.getByText('No messages yet')).toBeInTheDocument()

    await wrapper.setProps({ room: room(8) })
    await flushPromises()
    await wrapper.setProps({ room: room(7) })
    await flushPromises()

    // Others may have posted since the last visit.
    expect(screen.queryByText('No messages yet')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Loading messages' })).toBeInTheDocument()
    reload.resolve({ messages: [message] })
    await flushPromises()
    expect(screen.getByRole('listitem')).toHaveTextContent('Hello, world')
  })

  it("doesn't show a reopened room's old error while it loads again", async () => {
    const reload = deferred<{ messages: Message[] }>()
    requestJsonMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ messages: [] })
      .mockReturnValueOnce(reload.promise)
    const { wrapper, screen } = renderPanel(room(7))
    await flushPromises()
    // The composer's fields have alert regions of their own, so the error is found by its text.
    expect(screen.getByText("Couldn't load the messages.")).toBeInTheDocument()

    await wrapper.setProps({ room: room(8) })
    await flushPromises()
    await wrapper.setProps({ room: room(7) })
    await flushPromises()

    expect(screen.queryByText("Couldn't load the messages.")).not.toBeInTheDocument()
    reload.resolve({ messages: [] })
    await flushPromises()
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
