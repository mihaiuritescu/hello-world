import type { Message } from '#shared/domain.ts'
import type { MessageDraft } from '#shared/schemas.ts'
import { within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestJson } from '../../lib/http.ts'
import { createAppVuetify } from '../../plugins/vuetify.ts'
import MessageComposer from './MessageComposer.vue'

vi.mock('../../lib/http.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/http.ts')>()),
  requestJson: vi.fn(),
}))
const requestJsonMock = vi.mocked(requestJson)

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const stored: Message = {
  id: 1,
  roomId: 1,
  authorName: 'Alice',
  body: 'Hello',
  createdAt: '2026-11-02T10:00:00.000Z',
}

function renderComposer() {
  const user = userEvent.setup()
  const wrapper = mount(MessageComposer, {
    props: { roomId: 1 },
    global: { plugins: [createPinia(), createAppVuetify()] },
    attachTo: document.body,
  })
  const screen = within(document.body)
  return {
    wrapper,
    user,
    screen,
    nameField: screen.getByRole('textbox', { name: 'User name' }),
    messageField: screen.getByRole('textbox', { name: 'Message' }),
    submit: screen.getByRole('button', { name: 'Submit' }),
  }
}

/** The clientId of every send so far, in order. */
function sentClientIds(): string[] {
  return requestJsonMock.mock.calls.map(([, options]) => (options?.body as MessageDraft).clientId)
}

enableAutoUnmount(afterEach)

describe('MessageComposer', () => {
  beforeEach(() => {
    localStorage.clear()
    requestJsonMock.mockReset()
  })

  it('labels both fields and keeps the mockup placeholders visible', () => {
    const { nameField, messageField, submit } = renderComposer()

    expect(nameField).toHaveAttribute('placeholder', 'write your user name here')
    expect(messageField).toHaveAttribute('placeholder', 'write message here')
    expect(submit).toBeVisible()
  })

  it('sends the trimmed name and text, then clears the text and keeps the name', async () => {
    requestJsonMock.mockResolvedValue(stored)
    const { user, nameField, messageField, submit } = renderComposer()

    await user.type(nameField, ' Alice ')
    await user.type(messageField, ' Hello ')
    await user.click(submit)
    await flushPromises()

    expect(requestJsonMock).toHaveBeenCalledWith('/api/rooms/1/messages', {
      method: 'POST',
      body: {
        clientId: expect.stringMatching(UUID_V4) as string,
        authorName: 'Alice',
        body: 'Hello',
      },
    })
    expect(messageField).toHaveValue('')
    expect(nameField).toHaveValue(' Alice ')
  })

  it('sends with Enter in the message field', async () => {
    requestJsonMock.mockResolvedValue(stored)
    const { user, nameField, messageField } = renderComposer()

    await user.type(nameField, 'Alice')
    await user.type(messageField, 'Hello{Enter}')

    expect(requestJsonMock).toHaveBeenCalledTimes(1)
  })

  it('fills in the name remembered from an earlier visit', () => {
    localStorage.setItem('hello-world.authorName', 'Bob')

    const { nameField } = renderComposer()

    expect(nameField).toHaveValue('Bob')
  })

  it('keeps the draft after a failed send, and resends it with the same clientId (I3)', async () => {
    requestJsonMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(stored)
    const { user, screen, nameField, messageField, submit } = renderComposer()
    await user.type(nameField, 'Alice')
    await user.type(messageField, 'Hello')

    await user.click(submit)
    await flushPromises()

    expect(screen.getByText("Couldn't send the message. Please try again.")).toBeVisible()
    expect(messageField).toHaveValue('Hello')

    await user.click(submit)
    await flushPromises()

    const [first, second] = sentClientIds()
    expect(second).toBe(first)
    expect(messageField).toHaveValue('')
  })

  it('gives an edited draft a new clientId, so it is never mistaken for the failed one', async () => {
    requestJsonMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(stored)
    const { user, nameField, messageField, submit } = renderComposer()
    await user.type(nameField, 'Alice')
    await user.type(messageField, 'Hello')
    await user.click(submit)
    await flushPromises()

    await user.type(messageField, '!')
    await user.click(submit)
    await flushPromises()

    const [first, second] = sentClientIds()
    expect(second).not.toBe(first)
  })

  it('enables Submit only once both the name and the message have text', async () => {
    const { user, nameField, messageField, submit } = renderComposer()
    expect(submit).toBeDisabled()

    await user.type(nameField, 'Alice')
    expect(submit).toBeDisabled()

    await user.type(messageField, '   ')
    expect(submit).toBeDisabled()

    await user.type(messageField, 'Hi')
    expect(submit).toBeEnabled()
  })

  it('sends once while a send is in flight, however often the user submits', async () => {
    requestJsonMock.mockReturnValue(new Promise(() => {}))
    const { user, nameField, messageField, submit } = renderComposer()
    await user.type(nameField, 'Alice')
    await user.type(messageField, 'Hello')

    await user.click(submit)
    await user.type(messageField, '{Enter}')

    expect(requestJsonMock).toHaveBeenCalledTimes(1)
    expect(submit).toBeDisabled()
  })

  it('announces a sent message, so the panel can bring it into view', async () => {
    requestJsonMock.mockResolvedValue(stored)
    const { wrapper, user, nameField, messageField, submit } = renderComposer()
    await user.type(nameField, 'Alice')
    await user.type(messageField, 'Hello')

    await user.click(submit)
    await flushPromises()

    expect(wrapper.emitted('sent')).toHaveLength(1)
  })

  it('explains why a text with nothing visible in it cannot be sent', async () => {
    const { user, screen, nameField, messageField, submit } = renderComposer()
    await user.type(nameField, 'Alice')

    await user.type(messageField, '\u200B')

    expect(screen.getByText('Write at least one visible character.')).toBeVisible()
    expect(submit).toBeDisabled()
  })
})
