import { test as base, expect } from '@playwright/test'
import { resetDatabase } from './database.ts'

// A 1×1 transparent PNG, served instead of real map tiles so the tests never load
// OpenStreetMap's servers and don't depend on the network.
const BLANK_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

interface Options {
  /**
   * Console errors a test causes on purpose. Chromium logs every failed request as one, so a
   * test that makes a request fail lists that message here.
   */
  allowedConsoleErrors: RegExp[]
}

/**
 * The default `page`, on an empty database, with map tiles stubbed. It fails the test on any
 * browser console error, which includes Content-Security-Policy violations.
 */
export const test = base.extend<Options>({
  allowedConsoleErrors: [[], { option: true }],

  page: async ({ page, allowedConsoleErrors }, use) => {
    await resetDatabase()
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: BLANK_TILE }),
    )

    const errors: string[] = []
    page.on('console', (message) => {
      const allowed = allowedConsoleErrors.some((pattern) => pattern.test(message.text()))
      if (message.type() === 'error' && !allowed) errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    await use(page)

    expect(errors, 'browser console errors').toEqual([])
  },
})

export { expect }
