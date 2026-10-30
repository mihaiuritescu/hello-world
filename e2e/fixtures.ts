import { test as base, expect } from '@playwright/test'

// A 1×1 transparent PNG, served instead of real map tiles so the tests never load
// OpenStreetMap's servers and don't depend on the network.
const BLANK_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

/**
 * The default `page`, with map tiles stubbed, that fails the test on any browser console
 * error. That includes Content-Security-Policy violations.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: BLANK_TILE }),
    )

    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    await use(page)

    expect(errors, 'browser console errors').toEqual([])
  },
})

export { expect }
