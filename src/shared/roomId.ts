// How a room id is written in a URL or a route, for the browser's `?room=` and the server's
// `:roomId` alike. This file has no dependencies, so the browser can read a link without loading
// zod.

/**
 * The room id that `text` spells: a positive integer that fits in a JavaScript number, written
 * plainly. Forms such as `0x1`, `1e0` or `01` would give one room several URLs. Null otherwise.
 */
export function parseRoomId(text: string): number | null {
  if (!/^[1-9]\d*$/.test(text)) return null
  const id = Number(text)
  return Number.isSafeInteger(id) ? id : null
}
