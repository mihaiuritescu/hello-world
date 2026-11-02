import { test as base, expect, type Page } from '@playwright/test'
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

interface Fixtures {
  /** A second window, in its own browser context: another person, on another computer. */
  secondPage: Page
}

/** Stubs the map tiles and collects the page's console errors, except the allowed ones. */
async function watchPage(page: Page, allowedConsoleErrors: RegExp[]): Promise<string[]> {
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: BLANK_TILE }),
  )
  const errors: string[] = []
  page.on('console', (message) => {
    const allowed = allowedConsoleErrors.some((pattern) => pattern.test(message.text()))
    if (message.type() === 'error' && !allowed) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

/**
 * The default `page`, on an empty database, with map tiles stubbed. It fails the test on any
 * browser console error, which includes Content-Security-Policy violations. `secondPage`
 * works the same way, and is meant to be used together with `page`, which resets the database.
 */
export const test = base.extend<Options & Fixtures>({
  allowedConsoleErrors: [[], { option: true }],

  page: async ({ page, allowedConsoleErrors }, use) => {
    await resetDatabase()
    const errors = await watchPage(page, allowedConsoleErrors)

    await use(page)

    expect(errors, 'browser console errors').toEqual([])
  },

  secondPage: async ({ browser, allowedConsoleErrors }, use) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    const errors = await watchPage(page, allowedConsoleErrors)

    await use(page)

    await context.close()
    expect(errors, 'browser console errors in the second window').toEqual([])
  },
})

export { expect }
