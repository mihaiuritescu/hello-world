import type { Message } from '#shared/domain.ts'
import { within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { createAppVuetify } from '../../plugins/vuetify.ts'
import type { LoadStatus } from '../../stores/rooms.ts'
import MessageList from './MessageList.vue'

const message: Message = {
  id: 1,
  roomId: 1,
  authorName: 'Alice',
  body: 'Hello, world',
  createdAt: '2017-02-01T12:05:00.000Z',
}

function renderList(messages: Message[], status: LoadStatus = 'ready') {
  const wrapper = mount(MessageList, {
    props: { messages, status },
    global: { plugins: [createAppVuetify()] },
    attachTo: document.body,
  })
  return { wrapper, screen: within(document.body) }
}

enableAutoUnmount(afterEach)

describe('MessageList', () => {
  it('shows each message with its author, text and date', () => {
    const { screen } = renderList([message])

    const item = within(screen.getByRole('log', { name: 'Messages' })).getByRole('listitem')
    expect(item).toHaveTextContent('Alice:')
    expect(item).toHaveTextContent('Hello, world')
    // The client tests run in Europe/Bucharest, two hours ahead of UTC in February.
    expect(within(item).getByText('01/02/2017, 14:05')).toHaveAttribute(
      'datetime',
      message.createdAt,
    )
  })

  it('renders markup in user text as plain text (I7)', () => {
    const markup = '<img src="x" onerror="alert(1)">'
    const { screen } = renderList([{ ...message, authorName: '<b>Mallory</b>', body: markup }])

    const log = screen.getByRole('log', { name: 'Messages' })
    expect(within(log).getByText(markup)).toBeInTheDocument()
    expect(within(log).getByText('<b>Mallory</b>:')).toBeInTheDocument()
    expect(log.querySelector('img, b')).toBeNull()
  })

  it('says "No messages yet" in a room without messages', () => {
    const { screen } = renderList([])

    expect(screen.getByRole('log', { name: 'Messages' })).toHaveTextContent('No messages yet')
  })

  it('shows progress while the first messages load', () => {
    const { screen } = renderList([], 'loading')

    expect(screen.getByRole('progressbar', { name: 'Loading messages' })).toBeInTheDocument()
    expect(screen.queryByText('No messages yet')).not.toBeInTheDocument()
  })

  it('keeps showing the messages it has while they reload', () => {
    const { screen } = renderList([message], 'loading')

    expect(screen.getByRole('listitem')).toHaveTextContent('Hello, world')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('offers to retry when the messages could not load', async () => {
    const { wrapper, screen } = renderList([], 'error')

    expect(screen.getByText("Couldn't load the messages.")).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('keeps Retry in view when a load failed, even with messages listed', async () => {
    const { wrapper, screen } = renderList([message], 'error')

    expect(screen.getByRole('listitem')).toHaveTextContent('Hello, world')
    expect(screen.getByText("Couldn't load the latest messages.")).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  describe('scroll-following', () => {
    const next: Message = { ...message, id: 2, body: 'Next' }

    /** jsdom has no layout: give the log a fixed size, and a scroll position that sticks. */
    function fakeLayout(log: HTMLElement, scrollTop: number): void {
      let top = scrollTop
      Object.defineProperties(log, {
        scrollHeight: { configurable: true, get: () => 1000 },
        clientHeight: { configurable: true, get: () => 300 },
        scrollTop: {
          configurable: true,
          get: () => top,
          set: (value: number) => {
            top = value
          },
        },
      })
    }

    it('follows a new message while the reader is at the bottom', async () => {
      const { wrapper, screen } = renderList([message])
      const log = screen.getByRole('log', { name: 'Messages' })
      fakeLayout(log, 700)

      await wrapper.setProps({ messages: [message, next] })
      await flushPromises()

      expect(log.scrollTop).toBe(1000)
    })

    it('follows a reload that swaps old messages for new ones without changing the count', async () => {
      const third: Message = { ...message, id: 3, body: 'Third' }
      const { wrapper, screen } = renderList([message, next])
      const log = screen.getByRole('log', { name: 'Messages' })
      fakeLayout(log, 700)

      await wrapper.setProps({ messages: [next, third] })
      await flushPromises()

      expect(log.scrollTop).toBe(1000)
    })

    it('leaves a reader who scrolled up where they are', async () => {
      const { wrapper, screen } = renderList([message])
      const log = screen.getByRole('log', { name: 'Messages' })
      fakeLayout(log, 100)

      await wrapper.setProps({ messages: [message, next] })
      await flushPromises()

      expect(log.scrollTop).toBe(100)
    })
  })
})
