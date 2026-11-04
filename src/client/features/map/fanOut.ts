import type { ScreenPoint } from './clusterRooms.ts'

// A pin's image is 25×41 pixels (pinIcon.ts): pins this far apart never overlap.
const COLUMN_PX = 30
const ROW_PX = 46
const PER_ROW = 6

/**
 * Where to draw `count` pins that would sit on one another, as offsets in pixels from their spot:
 * side by side in rows of up to six, the first row centred on the spot and the next ones below.
 * Stacked on one pixel, only the pin drawn last could be clicked.
 */
export function fanOut(count: number): ScreenPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / PER_ROW)
    const inRow = Math.min(PER_ROW, count - row * PER_ROW)
    const column = index % PER_ROW
    return { x: (column - (inRow - 1) / 2) * COLUMN_PX, y: row * ROW_PX }
  })
}
