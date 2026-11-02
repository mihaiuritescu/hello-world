import { LIMITS, type Message } from '#shared/domain.ts'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestJson } from '../lib/http.ts'
import { deferred } from '../test/deferred.ts'
import { useMessagesStore } from './messages.ts'

vi.mock('../lib/http.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/http.ts')>()),
  requestJson: vi.fn(),
}))
const requestJsonMock = vi.mocked(requestJson)

function message(id: number, roomId = 1): Message {
  return {
    id,
    roomId,
    authorName: 'Alice',
    body: `Message ${id}`,
    createdAt: '2026-11-02T10:00:00.000Z',
  }
}

const draft = { clientId: '0b4b3a52-1c1e-4c43-9f0e-6f3a5d8f2b11', authorName: 'Alice', body: 'Hi' }

describe('messages store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    requestJsonMock.mockReset()
  })

  it("loads a room's messages and lists them by id", async () => {
    requestJsonMock.mockResolvedValue({ messages: [message(2), message(1)] })
    const messages = useMessagesStore()

    await messages.load(1)

    expect(requestJsonMock).toHaveBeenCalledWith('/api/rooms/1/messages')
    expect(messages.listFor(1).map((m) => m.id)).toEqual([1, 2])
    expect(messages.statusOf(1)).toBe('ready')
  })

  it('merges a reload with the messages it already has, without duplicates', async () => {
    const messages = useMessagesStore()
    messages.upsert(message(3))
    requestJsonMock.mockResolvedValue({ messages: [message(1), message(2), message(3)] })

    await messages.load(1)

    expect(messages.listFor(1).map((m) => m.id)).toEqual([1, 2, 3])
  })

  it('lets only the latest load of a room decide its status', async () => {
    const older = deferred<{ messages: Message[] }>()
    const newer = deferred<{ messages: Message[] }>()
    requestJsonMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const messages = useMessagesStore()
    const olderLoad = messages.load(1)
    const newerLoad = messages.load(1)

    newer.resolve({ messages: [] })
    await newerLoad
    older.reject(new Error('timed out'))
    await olderLoad

    expect(messages.statusOf(1)).toBe('ready')
  })

  it('ignores the messages of a load that a newer load overtook', async () => {
    const older = deferred<{ messages: Message[] }>()
    const newer = deferred<{ messages: Message[] }>()
    requestJsonMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const messages = useMessagesStore()
    const olderLoad = messages.load(1)
    const newerLoad = messages.load(1)

    newer.resolve({ messages: [message(2)] })
    await newerLoad
    older.resolve({ messages: [message(1)] })
    await olderLoad

    expect(messages.listFor(1).map((m) => m.id)).toEqual([2])
  })

  it('drops cached messages older than a full page, so a long absence leaves no gap', async () => {
    const messages = useMessagesStore()
    messages.upsert(message(1))
    messages.upsert(message(2, 2))
    const page = Array.from({ length: LIMITS.loadedMessages }, (_, index) => message(200 + index))
    requestJsonMock.mockResolvedValue({ messages: page })

    await messages.load(1)

    expect(messages.listFor(1)).toEqual(page)
    expect(messages.listFor(2)).toEqual([message(2, 2)])
  })

  it('reports a failed load', async () => {
    requestJsonMock.mockRejectedValue(new Error('offline'))
    const messages = useMessagesStore()

    await messages.load(1)

    expect(messages.statusOf(1)).toBe('error')
  })

  it("keeps each room's messages apart", () => {
    const messages = useMessagesStore()

    messages.upsert(message(1, 1))
    messages.upsert(message(2, 2))

    expect(messages.listFor(1).map((m) => m.id)).toEqual([1])
    expect(messages.listFor(2).map((m) => m.id)).toEqual([2])
  })

  it('keeps one entry per message when the same message arrives twice', () => {
    const messages = useMessagesStore()

    messages.upsert(message(4))
    messages.upsert(message(4))

    expect(messages.listFor(1)).toEqual([message(4)])
  })

  it('sends a draft, then adds and returns the stored message', async () => {
    requestJsonMock.mockResolvedValue(message(9))
    const messages = useMessagesStore()

    const sent = await messages.send(1, draft)

    expect(requestJsonMock).toHaveBeenCalledWith('/api/rooms/1/messages', {
      method: 'POST',
      body: draft,
    })
    expect(sent).toEqual(message(9))
    expect(messages.listFor(1)).toEqual([message(9)])
  })

  it('adds nothing when a send fails', async () => {
    requestJsonMock.mockRejectedValue(new Error('offline'))
    const messages = useMessagesStore()

    await expect(messages.send(1, draft)).rejects.toThrow('offline')
    expect(messages.listFor(1)).toEqual([])
  })
})
