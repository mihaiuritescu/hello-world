import { describe, expect, it } from 'vitest'
import { fanOut } from './fanOut.ts'

// A pin's image, in pixels (pinIcon.ts).
const PIN = { width: 25, height: 41 }

describe('fanOut', () => {
  it('leaves a pin on its own where it is', () => {
    expect(fanOut(1)).toEqual([{ x: 0, y: 0 }])
  })

  it('puts two pins side by side, centred on their spot', () => {
    expect(fanOut(2)).toEqual([
      { x: -15, y: 0 },
      { x: 15, y: 0 },
    ])
  })

  it('starts a row below the spot after six pins', () => {
    const offsets = fanOut(7)

    expect(offsets.slice(0, 6).every(({ y }) => y === 0)).toBe(true)
    expect(offsets[6]).toEqual({ x: 0, y: 46 })
  })

  it.each([2, 3, 6, 7, 12, 13])('keeps all %i pins clear of one another', (count) => {
    const offsets = fanOut(count)

    for (const [index, a] of offsets.entries()) {
      for (const b of offsets.slice(index + 1)) {
        const apart = Math.abs(a.x - b.x) >= PIN.width || Math.abs(a.y - b.y) >= PIN.height
        expect(apart).toBe(true)
      }
    }
  })
})
