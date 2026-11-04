import type { Page } from '@playwright/test'
import { seedMessages, seedRooms } from './database.ts'
import { expect, test } from './fixtures.ts'
import { overlap } from './layout.ts'

// A point on the left of the default 1280×720 viewport, clear of the chat panel on the right.
const WEST = { x: 250, y: 360 }

function nameField(page: Page) {
  return page.getByRole('textbox', { name: 'User name' })
}

function messageField(page: Page) {
  return page.getByRole('textbox', { name: 'Message' })
}

function messageList(page: Page) {
  return page.getByRole('log', { name: 'Messages' })
}

async function openNewRoom(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('.leaflet-container').click({ position: WEST })
  await expect(messageList(page)).toHaveText('No messages yet')
}

async function post(page: Page, name: string, text: string): Promise<void> {
  await nameField(page).fill(name)
  await messageField(page).fill(text)
  await page.getByRole('button', { name: 'Submit' }).click()
}

/**
 * Lets the next message POST reach the server, then fails it in the browser, as a dropped
 * connection would.
 */
async function loseNextSendResponse(page: Page): Promise<void> {
  let lost = false
  await page.route('**/api/rooms/*/messages', async (route) => {
    if (lost || route.request().method() !== 'POST') return route.continue()
    lost = true
    await route.fetch()
    await route.abort()
  })
}

test.describe('messages (FR-4, FR-5)', () => {
  test('posting a message shows its author, text and date, then clears the text @smoke', async ({
    page,
  }) => {
    await openNewRoom(page)

    await post(page, 'Alice', 'Hello, world')

    const message = messageList(page).getByRole('listitem')
    await expect(message).toContainText('Alice:')
    await expect(message).toContainText('Hello, world')
    await expect(message.locator('time')).toHaveText(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/)
    await expect(messageField(page)).toHaveValue('')
    await expect(nameField(page)).toHaveValue('Alice')
  })

  test('Enter in the message field sends the message', async ({ page }) => {
    await openNewRoom(page)
    await nameField(page).fill('Alice')
    await messageField(page).fill('Sent with Enter')

    await messageField(page).press('Enter')

    await expect(messageList(page).getByRole('listitem')).toContainText('Sent with Enter')
  })

  test('messages and the author name survive a reload', async ({ page }) => {
    await openNewRoom(page)
    await post(page, 'Alice', 'Still here')
    await expect(messageList(page).getByRole('listitem')).toContainText('Still here')

    await page.reload()

    await expect(messageList(page).getByRole('listitem')).toContainText('Still here')
    await expect(nameField(page)).toHaveValue('Alice')
  })

  test('a long chat opens on its newest 100 messages', async ({ page }) => {
    await seedRooms(1)
    await seedMessages(1, 120)

    await page.goto('/?room=1')

    const list = messageList(page)
    await expect(list.getByText('Message 120', { exact: true })).toBeInViewport()
    await expect(list.getByRole('listitem')).toHaveCount(100)
    await expect(list.getByText('Message 21', { exact: true })).toBeAttached()
  })

  test('a sent message scrolls into view, even when the reader had scrolled up', async ({
    page,
  }) => {
    await seedRooms(1)
    await seedMessages(1, 120)
    await page.goto('/?room=1')
    const list = messageList(page)
    await expect(list.getByText('Message 120', { exact: true })).toBeInViewport()

    await list.evaluate((element) => element.scrollTo({ top: 0 }))
    await expect(list.getByText('Message 21', { exact: true })).toBeInViewport()
    await post(page, 'Alice', 'The newest one')

    await expect(list.getByText('The newest one', { exact: true })).toBeInViewport()
  })

  test('a message never draws outside its own row', async ({ page }) => {
    await seedRooms(1)
    await seedMessages(1, 2)

    await page.goto('/?room=1')

    // Stacked accents could otherwise paint over the messages around them.
    await expect(messageList(page).getByRole('listitem').first()).toHaveCSS('overflow', 'clip')
  })

  test('a long chat leaves the map attribution clear', async ({ page }) => {
    await seedRooms(1)
    await seedMessages(1, 120)

    await page.goto('/?room=1')
    await expect(messageList(page).getByText('Message 120', { exact: true })).toBeVisible()

    const panel = page.getByRole('complementary', { name: 'Chat' })
    const attribution = page.locator('.leaflet-control-attribution')
    expect(await overlap(panel, attribution)).toBe(false)
  })

  test('a long chat on a phone leaves the zoom controls and the attribution clear', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedRooms(1)
    await seedMessages(1, 120)

    await page.goto('/?room=1')
    await expect(messageList(page).getByText('Message 120', { exact: true })).toBeVisible()

    const panel = page.getByRole('complementary', { name: 'Chat' })
    for (const control of [
      page.getByRole('button', { name: 'Zoom in' }),
      page.getByRole('button', { name: 'Zoom out' }),
      page.locator('.leaflet-control-attribution'),
    ]) {
      expect(await overlap(panel, control)).toBe(false)
    }
  })

  test('a short phone screen keeps the message field and Submit in view, clear of the zoom controls', async ({
    page,
  }) => {
    // A phone sharing its screen with another app.
    await page.setViewportSize({ width: 390, height: 320 })
    await seedRooms(1)

    await page.goto('/?room=1')

    await expect(messageField(page)).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('button', { name: 'Submit' })).toBeInViewport({ ratio: 1 })
    const panel = page.getByRole('complementary', { name: 'Chat' })
    for (const control of [
      page.getByRole('button', { name: 'Zoom in' }),
      page.getByRole('button', { name: 'Zoom out' }),
    ]) {
      expect(await overlap(panel, control)).toBe(false)
    }
  })

  test('a panel too short for its composer scrolls, so Submit stays within reach', async ({
    page,
  }) => {
    // Even beside the zoom controls, the room's header and composer don't fit in this height.
    await page.setViewportSize({ width: 390, height: 250 })
    await seedRooms(1)
    await page.goto('/?room=1')
    await expect(page.getByRole('heading', { name: 'Chatroom 1' })).toBeVisible()

    await page.getByRole('complementary', { name: 'Chat' }).hover()
    await page.mouse.wheel(0, 300)

    await expect(page.getByRole('button', { name: 'Submit' })).toBeInViewport({ ratio: 1 })
  })

  test('the next room opens at its top, even after the panel was scrolled', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 250 })
    await seedRooms(1)
    await page.goto('/?room=1')
    await expect(page.getByRole('heading', { name: 'Chatroom 1' })).toBeVisible()
    await page.getByRole('complementary', { name: 'Chat' }).hover()
    await page.mouse.wheel(0, 300)
    await expect(page.getByRole('button', { name: 'Submit' })).toBeInViewport({ ratio: 1 })

    // On the map, left of the panel and below the zoom controls: creates room 2 and opens it.
    await page.mouse.click(30, 200)

    await expect(page.getByRole('heading', { name: 'Chatroom 2' })).toBeInViewport({ ratio: 1 })
  })

  test.describe('when the server limits sends', () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource/] })

    test('sending too fast asks the user to slow down, and keeps the draft', async ({ page }) => {
      await openNewRoom(page)
      await page.route('**/api/rooms/*/messages', (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({
              status: 429,
              json: {
                statusCode: 429,
                error: 'Too Many Requests',
                message: 'Too many requests. Try again in 1 minute.',
                code: 'RATE_LIMITED',
              },
            })
          : route.continue(),
      )

      await post(page, 'Alice', 'Too fast')

      await expect(
        page.getByText("You're sending messages too fast. Wait a moment, then try again."),
      ).toBeVisible()
      await expect(messageField(page)).toHaveValue('Too fast')
    })
  })

  test.describe('when a response is lost', () => {
    test.use({ allowedConsoleErrors: [/Failed to load resource/] })

    test('the draft stays, and sending it again stores the message once (I3)', async ({ page }) => {
      await openNewRoom(page)
      await loseNextSendResponse(page)

      await post(page, 'Alice', 'Only once')
      await expect(page.getByText("Couldn't send the message. Please try again.")).toBeVisible()
      await expect(messageField(page)).toHaveValue('Only once')

      await page.getByRole('button', { name: 'Submit' }).click()
      await expect(messageList(page).getByRole('listitem')).toHaveCount(1)
      await expect(messageField(page)).toHaveValue('')

      await page.reload()
      await expect(messageList(page).getByRole('listitem')).toHaveText(/Only once/)
      await expect(messageList(page).getByRole('listitem')).toHaveCount(1)
    })
  })
})
