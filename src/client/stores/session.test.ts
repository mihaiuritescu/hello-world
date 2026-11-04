import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useSessionStore } from './session.ts'

function openPage(search: string): void {
  window.history.replaceState(null, '', `/${search}`)
}

describe('session store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('reads the open room from the URL', () => {
    openPage('?room=7')

    expect(useSessionStore().selectedRoomId).toBe(7)
  })

  it.each([
    '?room=abc',
    '?room=0',
    '?room=-3',
    '?room=1.5',
    '?room=01',
    '?room=0x1',
    '?room=1e0',
    '?room=9007199254740993',
    '',
  ])('treats %j as no open room', (search) => {
    openPage(search)

    expect(useSessionStore().selectedRoomId).toBeNull()
  })

  it('writes the selected room to the URL, replacing the history entry', async () => {
    openPage('')
    const historyLength = window.history.length
    const session = useSessionStore()

    session.selectRoom(3)
    await nextTick()

    expect(session.selectedRoomId).toBe(3)
    expect(window.location.search).toBe('?room=3')
    expect(window.history.length).toBe(historyLength)
  })

  it('removes the room from the URL when the selection is cleared', async () => {
    openPage('?room=4')
    const session = useSessionStore()

    session.selectRoom(null)
    await nextTick()

    expect(session.selectedRoomId).toBeNull()
    expect(window.location.search).toBe('')
  })

  it('remembers the author name on this device', async () => {
    const session = useSessionStore()

    session.authorName = 'Alice'
    await nextTick()

    expect(localStorage.getItem('hello-world.authorName')).toBe('Alice')
  })

  it('starts with the author name remembered from an earlier visit', () => {
    localStorage.setItem('hello-world.authorName', 'Bob')

    expect(useSessionStore().authorName).toBe('Bob')
  })

  it('remembers the owner token of each room this browser created', () => {
    const session = useSessionStore()

    session.rememberOwnerToken(5, 'token-5')

    expect(session.ownerTokenFor(5)).toBe('token-5')
    expect(session.ownsRoom(5)).toBe(true)
    expect(session.ownsRoom(6)).toBe(false)
  })

  it('keeps owner tokens on this device, for the next visit', async () => {
    useSessionStore().rememberOwnerToken(5, 'token-5')
    await nextTick()

    setActivePinia(createPinia())

    expect(useSessionStore().ownerTokenFor(5)).toBe('token-5')
  })

  it('forgets the owner token of a room it no longer needs, and keeps the others', () => {
    const session = useSessionStore()
    session.rememberOwnerToken(5, 'token-5')
    session.rememberOwnerToken(6, 'token-6')

    session.forgetOwnerToken(5)

    expect(session.ownsRoom(5)).toBe(false)
    expect(session.ownerTokenFor(6)).toBe('token-6')
  })

  it('ignores a stored owner token that is not text', () => {
    localStorage.setItem('hello-world.ownerTokens', JSON.stringify({ 5: { not: 'a token' } }))

    expect(useSessionStore().ownsRoom(5)).toBe(false)
  })
})
