import type { Room } from '#shared/domain.ts'
import { within } from '@testing-library/dom'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ChatMap from './ChatMap.vue'

// jsdom has no layout, so these tests only cover keyboard input and which pins exist. Clicks,
// drags and where pins sit are covered by the Playwright tests.
async function renderMap(rooms: Room[] = []) {
  const wrapper = mount(ChatMap, {
    props: { rooms, selectedRoomId: null },
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

  function room(id: number): Room {
    return { id, lat: 45 + id, lng: 20, createdAt: '2026-11-02T10:00:00.000Z' }
  }

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
})
