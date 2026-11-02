import type { Message } from '#shared/domain.ts'
import type { MessageDraft } from '#shared/schemas.ts'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestJson } from '../lib/http.ts'
import { deferred } from '../test/deferred.ts'
import { useDraftsStore } from './drafts.ts'
import { useMessagesStore } from './messages.ts'

vi.mock('../lib/http.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/http.ts')>()),
  requestJson: vi.fn(),
}))
const requestJsonMock = vi.mocked(requestJson)

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SEND_FAILED = "Couldn't send the message. Please try again."

function stored(id: number): Message {
  return {
    id,
    roomId: 1,
    authorName: 'Alice',
    body: 'Hello',
    createdAt: '2026-11-02T10:00:00.000Z',
  }
}

/** Every draft sent so far, in order. */
function sentDrafts(): MessageDraft[] {
  return requestJsonMock.mock.calls.map(([, options]) => options?.body as MessageDraft)
}

describe('drafts store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    requestJsonMock.mockReset()
  })

  it('sends the trimmed name and text with a new clientId, then empties the draft', async () => {
    requestJsonMock.mockResolvedValue(stored(1))
    const drafts = useDraftsStore()
    const draft = drafts.draftFor(1)
    draft.text = ' Hello '

    expect(await drafts.send(1, ' Alice ')).toBe(true)

    expect(sentDrafts()).toEqual([
      { clientId: expect.stringMatching(UUID_V4) as string, authorName: 'Alice', body: 'Hello' },
    ])
    expect(draft.text).toBe('')
    expect(useMessagesStore().listFor(1)).toEqual([stored(1)])
  })

  it('keeps a failed draft with an error, and sends it again with the same clientId (I3)', async () => {
    requestJsonMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(stored(1))
    const drafts = useDraftsStore()
    const draft = drafts.draftFor(1)
    draft.text = 'Hello'

    expect(await drafts.send(1, 'Alice')).toBe(false)
    expect(draft).toMatchObject({ text: 'Hello', error: SEND_FAILED, sending: false })

    expect(await drafts.send(1, 'Alice')).toBe(true)
    const [first, second] = sentDrafts()
    expect(second?.clientId).toBe(first?.clientId)
  })

  it('reuses the clientId after an edit that leaves the trimmed text and name unchanged', async () => {
    requestJsonMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(stored(1))
    const drafts = useDraftsStore()
    const draft = drafts.draftFor(1)
    draft.text = 'Hello'
    await drafts.send(1, 'Alice')

    draft.text = 'Hello '
    await drafts.send(1, 'Alice ')

    const [first, second] = sentDrafts()
    expect(second?.clientId).toBe(first?.clientId)
  })

  it.each([
    ['the text', { text: 'Hello!', name: 'Alice' }],
    ['the name', { text: 'Hello', name: 'Bob' }],
  ])('uses a new clientId once %s changes', async (_case, edit) => {
    requestJsonMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(stored(1))
    const drafts = useDraftsStore()
    const draft = drafts.draftFor(1)
    draft.text = 'Hello'
    await drafts.send(1, 'Alice')

    draft.text = edit.text
    await drafts.send(1, edit.name)

    const [first, second] = sentDrafts()
    expect(second?.clientId).not.toBe(first?.clientId)
  })

  it('keeps text typed while the message was on its way', async () => {
    const response = deferred<Message>()
    requestJsonMock.mockReturnValueOnce(response.promise)
    const drafts = useDraftsStore()
    const draft = drafts.draftFor(1)
    draft.text = 'Hello'

    const sending = drafts.send(1, 'Alice')
    draft.text = 'Hello world'
    response.resolve(stored(1))
    await sending

    expect(draft.text).toBe('Hello world')
  })

  it('sends once while a send is in flight', async () => {
    requestJsonMock.mockReturnValue(new Promise(() => {}))
    const drafts = useDraftsStore()
    drafts.draftFor(1).text = 'Hello'

    void drafts.send(1, 'Alice')

    expect(await drafts.send(1, 'Alice')).toBe(false)
    expect(requestJsonMock).toHaveBeenCalledTimes(1)
    expect(drafts.draftFor(1).sending).toBe(true)
  })

  it.each([
    ['a blank name', { text: 'Hello', name: '  ' }],
    ['a blank text', { text: ' ', name: 'Alice' }],
  ])('sends nothing with %s', async (_case, input) => {
    const drafts = useDraftsStore()
    drafts.draftFor(1).text = input.text

    expect(await drafts.send(1, input.name)).toBe(false)
    expect(requestJsonMock).not.toHaveBeenCalled()
  })

  it("keeps each room's draft apart", () => {
    const drafts = useDraftsStore()

    drafts.draftFor(1).text = 'For room 1'

    expect(drafts.draftFor(2).text).toBe('')
    expect(drafts.draftFor(1).text).toBe('For room 1')
  })
})
