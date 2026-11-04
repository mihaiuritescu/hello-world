import AxeBuilder from '@axe-core/playwright'
import { seedMessages, seedRooms, seedRoomsAt } from './database.ts'
import { expect, test } from './fixtures.ts'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test.describe('accessibility', () => {
  test('the start screen has no detectable WCAG violations', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Click on the map to start a chat')).toBeVisible()

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()

    expect(results.violations).toEqual([])
  })

  test('an open room, with its pin, has no detectable WCAG violations', async ({ page }) => {
    await page.goto('/')
    await page.locator('.leaflet-container').click({ position: { x: 250, y: 360 } })
    await expect(page.getByRole('heading', { name: 'Chatroom 1' })).toBeVisible()

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()

    expect(results.violations).toEqual([])
  })

  test("a room's rename form has no detectable WCAG violations", async ({ page }) => {
    await page.goto('/')
    await page.locator('.leaflet-container').click({ position: { x: 250, y: 360 } })
    await page.getByRole('button', { name: 'Rename this room' }).click()
    await expect(page.getByRole('textbox', { name: 'Room name' })).toBeFocused()

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()

    expect(results.violations).toEqual([])
  })

  test('a map with a circle of grouped pins has no detectable WCAG violations', async ({
    page,
  }) => {
    await seedRoomsAt([
      { lat: 46.77, lng: 23.59 },
      { lat: 46.78, lng: 23.6 },
    ])
    await page.goto('/')
    await expect(page.getByRole('button', { name: '2 chatrooms' })).toBeVisible()

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()

    expect(results.violations).toEqual([])
  })

  test('a room with a scrolling message list has no detectable WCAG violations', async ({
    page,
  }) => {
    await seedRooms(1)
    await seedMessages(1, 30)
    await page.goto('/?room=1')
    await expect(
      page.getByRole('log', { name: 'Messages' }).getByText('Message 30', { exact: true }),
    ).toBeVisible()

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()

    expect(results.violations).toEqual([])
  })

  test.describe('error states', () => {
    // Chromium logs every failed request as a console error.
    test.use({ allowedConsoleErrors: [/Failed to load resource/] })

    const serverError = {
      status: 500,
      json: {
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Something went wrong. Please try again.',
        code: 'INTERNAL_ERROR',
      },
    }

    test('a room list that failed to load has no detectable WCAG violations', async ({ page }) => {
      await page.route('**/api/rooms', (route) => route.fulfill(serverError))
      await page.goto('/')
      await expect(page.getByRole('alert')).toHaveText("Couldn't load the chatrooms.")

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()

      expect(results.violations).toEqual([])
    })

    test("a room whose messages didn't load has no detectable WCAG violations", async ({
      page,
    }) => {
      await seedRooms(1)
      await page.route('**/api/rooms/1/messages', (route) => route.fulfill(serverError))
      await page.goto('/?room=1')
      await expect(page.getByRole('alert')).toHaveText("Couldn't load the messages.")

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()

      expect(results.violations).toEqual([])
    })
  })
})
