import { describe, expect, it } from 'vitest'
import { formatMessageDate } from './formatMessageDate.ts'

// The client tests run in Europe/Bucharest (see vitest.config.ts), two hours ahead of UTC in
// February.
describe('formatMessageDate', () => {
  it('shows the date as in the mockups, followed by the time of day', () => {
    expect(formatMessageDate('2017-02-01T12:05:00.000Z')).toBe('01/02/2017, 14:05')
  })

  it("uses the reader's time zone, even when that changes the date", () => {
    expect(formatMessageDate('2017-02-01T22:30:00.000Z')).toBe('02/02/2017, 00:30')
  })
})
