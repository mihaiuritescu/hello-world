import type { Page } from '@playwright/test'
import { seedRooms } from './database.ts'
import { expect, test } from './fixtures.ts'

// Points on the left of the default 1280×720 viewport, clear of the chat panel on the right.
const WEST = { x: 250, y: 360 }
const EAST = { x: 550, y: 300 }

function map(page: Page) {
  return page.locator('.leaflet-container')
}

function heading(page: Page, name: string) {
  return page.getByRole('heading', { name })
}

async function mapBox(page: Page) {
  const box = await map(page).boundingBox()
  if (!box) throw new Error('The map must be rendered')
  return box
}

/** Holds the next `POST /api/rooms` until the returned function is called. */
async function holdNextRoomCreate(page: Page): Promise<() => void> {
  let release = () => {}
  const released = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/rooms', async (route) => {
    if (route.request().method() === 'POST') await released
    await route.continue()
  })
  return release
}

test.describe('rooms (FR-2, FR-3, FR-5)', () => {
  test('a click on the map drops a pin and opens its room @smoke', async ({ page }) => {
    await page.goto('/')

    await map(page).click({ position: WEST })

    await expect(heading(page, 'Chatroom 1')).toBeVisible()
    await expect(page.getByTitle('Chatroom 1')).toBeVisible()
    await expect(page).toHaveURL(/\?room=1$/)
  })

  test('a double-click creates exactly one room and does not zoom', async ({ page }) => {
    await page.goto('/')
    const zoomBefore = await page
      .getByRole('region', { name: 'World map' })
      .getAttribute('data-zoom')

    await map(page).dblclick({ position: WEST })
    await expect(heading(page, 'Chatroom 1')).toBeVisible()
    // A second room created by the double-click would make the next one "Chatroom 3".
    await map(page).click({ position: EAST })

    await expect(heading(page, 'Chatroom 2')).toBeVisible()
    await expect(page.getByRole('region', { name: 'World map' })).toHaveAttribute(
      'data-zoom',
      zoomBefore ?? '',
    )
  })

  test('dragging the map creates no room', async ({ page }) => {
    await page.goto('/')
    const box = await mapBox(page)

    await page.mouse.move(box.x + WEST.x, box.y + WEST.y)
    await page.mouse.down()
    await page.mouse.move(box.x + WEST.x + 200, box.y + WEST.y + 80, { steps: 10 })
    await page.mouse.up()
    // A room created by the drag would make the next one "Chatroom 2".
    await map(page).click({ position: EAST })

    await expect(heading(page, 'Chatroom 1')).toBeVisible()
  })

  test('Enter on the focused map creates a room at its centre', async ({ page }) => {
    await page.goto('/')

    await map(page).focus()
    await page.keyboard.press('Enter')

    await expect(heading(page, 'Chatroom 1')).toBeVisible()
  })

  test('a click on a pin opens its room and highlights the pin', async ({ page }) => {
    await page.goto('/')
    await map(page).click({ position: WEST })
    await expect(heading(page, 'Chatroom 1')).toBeVisible()
    await map(page).click({ position: EAST })
    await expect(heading(page, 'Chatroom 2')).toBeVisible()

    await page.getByTitle('Chatroom 1').click()

    await expect(heading(page, 'Chatroom 1')).toBeVisible()
    await expect(page).toHaveURL(/\?room=1$/)
    await expect(page.getByTitle('Chatroom 1')).toHaveClass(/room-pin--active/)
    await expect(page.getByTitle('Chatroom 2')).not.toHaveClass(/room-pin--active/)
  })

  test('Enter on a focused pin opens its room', async ({ page }) => {
    await page.goto('/')
    await map(page).click({ position: WEST })
    await map(page).click({ position: EAST })
    await expect(heading(page, 'Chatroom 2')).toBeVisible()

    await page.getByTitle('Chatroom 1').focus()
    await page.keyboard.press('Enter')

    await expect(heading(page, 'Chatroom 1')).toBeVisible()
  })

  test('a slow create does not take over a room opened in the meantime', async ({ page }) => {
    await page.goto('/')
    await map(page).click({ position: WEST })
    await expect(heading(page, 'Chatroom 1')).toBeVisible()
    const releaseCreate = await holdNextRoomCreate(page)

    await map(page).click({ position: EAST })
    await page.getByTitle('Chatroom 1').click()
    releaseCreate()
    await expect(page.getByTitle('Chatroom 2')).toBeVisible()

    await expect(heading(page, 'Chatroom 1')).toBeVisible()
    await expect(page).toHaveURL(/\?room=1$/)
  })

  test('a link reopens a room older than the 1,000 rooms on the map', async ({ page }) => {
    await seedRooms(1001)

    await page.goto('/?room=1')

    await expect(heading(page, 'Chatroom 1')).toBeVisible()
  })

  test('rooms and the open room survive a reload', async ({ page }) => {
    await page.goto('/')
    await map(page).click({ position: WEST })
    await map(page).click({ position: EAST })
    await page.getByTitle('Chatroom 1').click()
    await expect(page).toHaveURL(/\?room=1$/)

    await page.reload()

    await expect(heading(page, 'Chatroom 1')).toBeVisible()
    await expect(page.getByTitle('Chatroom 1')).toBeVisible()
    await expect(page.getByTitle('Chatroom 2')).toBeVisible()
  })
})
