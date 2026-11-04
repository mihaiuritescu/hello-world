import type { Page } from '@playwright/test'
import { seedMessages, seedRooms, seedRoomsAt } from './database.ts'
import { expect, test } from './fixtures.ts'
import { overlap } from './layout.ts'

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

/**
 * Zooms out as far as the map goes, to zoom 3, where a world is 2,048 px wide. Then it drags the
 * map about 80° east, so that the view's east edge ends past the date line. The drag is one step,
 * so that the map doesn't glide on after it.
 */
async function zoomOutAndDragEast(page: Page, box: Awaited<ReturnType<typeof mapBox>>) {
  await page.mouse.move(box.x + WEST.x, box.y + WEST.y)
  await page.mouse.wheel(0, 2000)
  await expect(page.getByRole('region', { name: 'World map' })).toHaveAttribute('data-zoom', '3')
  // Leaflet ignores a drag that starts while a zoom is still under way.
  await expect(page.locator('.leaflet-zoom-anim')).toHaveCount(0)
  await page.mouse.move(box.x + 900, box.y + 400)
  await page.mouse.down()
  await page.mouse.move(box.x + 450, box.y + 400)
  await page.mouse.up()
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

/** The body the server sends when a client goes over a rate limit. */
const RATE_LIMITED = {
  statusCode: 429,
  error: 'Too Many Requests',
  message: 'Too many requests. Try again in 1 minute.',
  code: 'RATE_LIMITED',
}

const SERVER_ERROR = {
  statusCode: 500,
  error: 'Internal Server Error',
  message: 'Something went wrong. Please try again.',
  code: 'INTERNAL_ERROR',
}

test.describe('rooms, when something goes wrong', () => {
  // Chromium logs every failed request as a console error.
  test.use({ allowedConsoleErrors: [/Failed to load resource/] })

  test('creating chatrooms too fast asks the user to slow down', async ({ page }) => {
    await page.route('**/api/rooms', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 429, json: RATE_LIMITED })
        : route.continue(),
    )
    await page.goto('/')

    await map(page).click({ position: WEST })

    await expect(
      page.getByText("You're creating chatrooms too fast. Wait a minute, then try again."),
    ).toBeVisible()
    await expect(page.getByText('Click on the map to start a chat')).toBeVisible()
  })

  test('a link to a chatroom that does not exist says so, and shows the start screen', async ({
    page,
  }) => {
    await page.goto('/?room=42')

    await expect(page.getByText("Chatroom 42 doesn't exist.")).toBeVisible()
    await expect(page).not.toHaveURL(/room=/)
    await expect(page.getByText('Click on the map to start a chat')).toBeVisible()
  })

  test('when the chatrooms fail to load, the start panel says so and offers Retry', async ({
    page,
  }) => {
    await page.route('**/api/rooms', (route) => route.fulfill({ status: 500, json: SERVER_ERROR }))

    await page.goto('/')

    await expect(page.getByRole('alert')).toHaveText("Couldn't load the chatrooms.")
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  })
})

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

  test("a click by the map's eastern edge puts the new room's pin where it was clicked", async ({
    page,
  }) => {
    await page.goto('/')
    const box = await mapBox(page)
    await zoomOutAndDragEast(page, box)

    // Past the date line, where the view shows the next copy of the world.
    await map(page).click({ position: { x: box.width - 30, y: box.height - 80 } })

    await expect(heading(page, 'Chatroom 1')).toBeVisible()
    await expect(page.getByTitle('Chatroom 1')).toBeInViewport()
  })

  test('a room in the far east can be dragged clear of a tall chat panel', async ({ page }) => {
    // Tokyo, and an open room whose messages make the panel reach down the map.
    await seedRoomsAt([
      { lat: 35.68, lng: 139.69 },
      { lat: 47, lng: 20 },
    ])
    await seedMessages(2, 30)
    await page.goto('/?room=2')
    const box = await mapBox(page)

    await zoomOutAndDragEast(page, box)

    const tokyo = page.getByTitle('Chatroom 1')
    expect(await overlap(tokyo, page.getByRole('complementary', { name: 'Chat' }))).toBe(false)
    await tokyo.click()
    await expect(heading(page, 'Chatroom 1')).toBeVisible()
  })

  test('asks only for tiles that exist, on a screen wider than the world', async ({ page }) => {
    await page.setViewportSize({ width: 2600, height: 900 })
    const columns: number[] = []
    page.on('request', (request) => {
      const column = /tile\.openstreetmap\.org\/3\/(-?\d+)\//.exec(request.url())?.[1]
      if (column !== undefined) columns.push(Number(column))
    })
    await page.goto('/')
    const box = await mapBox(page)

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 2000)

    // At zoom 3 the world is eight tiles wide, and this screen shows all of it and more.
    await expect.poll(() => [0, 7].every((column) => columns.includes(column))).toBe(true)
    expect(columns.filter((column) => column < 0 || column > 7)).toEqual([])
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
