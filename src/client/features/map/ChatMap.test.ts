import type { Room } from '#shared/domain.ts'
import { within } from '@testing-library/dom'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ChatMap from './ChatMap.vue'

// jsdom has no layout, so these tests only cover keyboard input and which pins and circles exist.
// Clicks, drags, zooming and where markers sit are covered by the Playwright tests.
async function renderMap(rooms: Room[] = [], selectedRoomId: number | null = null) {
  const wrapper = mount(ChatMap, {
    props: { rooms, selectedRoomId },
    attachTo: document.body,
  })
  // The keyboard listener is attached once the template ref is set, one tick after mounting.
  await flushPromises()
  return { wrapper, canvas: wrapper.get('.leaflet-container').element }
}

function pressEnter(target: Element, repeat = false): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat, bubbles: true }))
}

describe('ChatMap keyboard input', () => {
  let unmount: () => void

  afterEach(() => {
    unmount()
  })

  it('creates a room at the centre when Enter is pressed on the map', async () => {
    const { wrapper, canvas } = await renderMap()
    unmount = () => wrapper.unmount()

    pressEnter(canvas)

    expect(wrapper.emitted('createAt')).toEqual([[{ lat: 47, lng: 20 }]])
  })

  it('ignores the key repeats of a held Enter key', async () => {
    const { wrapper, canvas } = await renderMap()
    unmount = () => wrapper.unmount()

    pressEnter(canvas)
    pressEnter(canvas, true)
    pressEnter(canvas, true)

    expect(wrapper.emitted('createAt')).toHaveLength(1)
  })

  it('leaves Enter on an element inside the map, such as a pin, to that element', async () => {
    const { wrapper, canvas } = await renderMap()
    unmount = () => wrapper.unmount()
    const pin = document.createElement('button')
    canvas.append(pin)

    pressEnter(pin)

    expect(wrapper.emitted('createAt')).toBeUndefined()
  })
})

describe('ChatMap pins', () => {
  let unmount: () => void

  afterEach(() => {
    unmount()
  })

  /** A room 5° of latitude from the next one: far enough apart that their pins never merge. */
  function room(id: number, changes: Partial<Room> = {}): Room {
    return {
      id,
      lat: 40 + id * 5,
      lng: 20,
      name: null,
      revision: 0,
      createdAt: '2026-11-02T10:00:00.000Z',
      ...changes,
    }
  }

  const SAME_SPOT = { lat: 47, lng: 20 }

  it('draws rooms whose pins would overlap as one circle with their count', async () => {
    const { wrapper } = await renderMap([room(1, SAME_SPOT), room(2, SAME_SPOT)])
    unmount = () => wrapper.unmount()
    const screen = within(document.body)

    expect(screen.getByRole('button', { name: '2 chatrooms' })).toHaveTextContent('2')
    expect(screen.queryByTitle('Chatroom 1')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Chatroom 2')).not.toBeInTheDocument()
  })

  it('never folds the open room into a circle', async () => {
    const rooms = [room(1, SAME_SPOT), room(2, SAME_SPOT), room(3, SAME_SPOT)]
    const { wrapper } = await renderMap(rooms, 2)
    unmount = () => wrapper.unmount()
    const screen = within(document.body)

    expect(screen.getByTitle('Chatroom 2')).toHaveClass('room-pin--active')
    expect(screen.getByRole('button', { name: '2 chatrooms' })).toBeInTheDocument()
  })

  it('turns a circle back into pins once its rooms no longer overlap', async () => {
    const { wrapper } = await renderMap([room(1, SAME_SPOT), room(2, SAME_SPOT)])
    unmount = () => wrapper.unmount()
    const screen = within(document.body)

    await wrapper.setProps({ rooms: [room(1, SAME_SPOT), room(2)] })

    expect(screen.queryByRole('button', { name: '2 chatrooms' })).not.toBeInTheDocument()
    expect(screen.getByTitle('Chatroom 1')).toBeInTheDocument()
    expect(screen.getByTitle('Chatroom 2')).toBeInTheDocument()
  })

  it('swaps the pins when the list keeps its length but changes its rooms', async () => {
    const { wrapper } = await renderMap([room(1), room(2)])
    unmount = () => wrapper.unmount()
    const screen = within(document.body)
    expect(screen.getByTitle('Chatroom 1')).toBeInTheDocument()

    // At the cap, a new room pushes the oldest out, and the count stays the same.
    await wrapper.setProps({ rooms: [room(2), room(3)] })

    expect(screen.queryByTitle('Chatroom 1')).not.toBeInTheDocument()
    expect(screen.getByTitle('Chatroom 2')).toBeInTheDocument()
    expect(screen.getByTitle('Chatroom 3')).toBeInTheDocument()
  })

  it("names a pin after its room, and follows the room's renames", async () => {
    const { wrapper } = await renderMap([room(1)])
    unmount = () => wrapper.unmount()
    const screen = within(document.body)

    await wrapper.setProps({ rooms: [room(1, { name: 'Picnic', revision: 1 })] })

    expect(screen.queryByTitle('Chatroom 1')).not.toBeInTheDocument()
    expect(screen.getByTitle('Picnic')).toHaveAttribute('alt', 'Picnic')
  })

  it('names a pin drawn again after a circle with its newest name', async () => {
    const { wrapper } = await renderMap([room(1, SAME_SPOT), room(2, SAME_SPOT)])
    unmount = () => wrapper.unmount()
    const screen = within(document.body)

    await wrapper.setProps({ rooms: [room(1, { ...SAME_SPOT, name: 'Picnic' }), room(2)] })

    expect(screen.getByTitle('Picnic')).toBeInTheDocument()
  })

  it('puts a name with markup on its pin as plain text, which runs nothing', async () => {
    const name = '<img src=x onerror=alert(1)>'
    const { wrapper } = await renderMap([room(1, { name })])
    unmount = () => wrapper.unmount()
    const screen = within(document.body)

    expect(screen.getByTitle(name)).toHaveAttribute('alt', name)
    expect(document.querySelector('img[src="x"], [onerror]')).toBeNull()
  })
})
