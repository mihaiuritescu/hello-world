import type { Page } from '@playwright/test'
import { seedMessages, seedRoomsAt } from './database.ts'
import { expect, test } from './fixtures.ts'
import { below, overlap } from './layout.ts'

// Three rooms in Cluj, about a kilometre apart: one spot at the opening zoom.
const CLUJ = [
  { lat: 46.77, lng: 23.59 },
  { lat: 46.78, lng: 23.6 },
  { lat: 46.76, lng: 23.58 },
]

// Rooms 1 and 2 about four metres apart, room 3 about ten kilometres east: one spot at the
// opening zoom, and still two once zoomed in to fit all three.
const NEAR_AND_FAR = [
  { lat: 46.77, lng: 23.59 },
  { lat: 46.77004, lng: 23.59 },
  { lat: 46.77, lng: 23.72 },
]

// An iPad mini held upright: the panel's left edge sits just left of the map's centre.
const TABLET = { width: 744, height: 1133 }

// About 760 metres apart, east to west: one spot left of the panel at the opening zoom.
const WESTERN_PAIR = [
  { lat: 47, lng: 15 },
  { lat: 47, lng: 15.01 },
]

function pin(page: Page, id: number) {
  return page.getByTitle(`Chatroom ${id}`)
}

function zoomLevel(page: Page) {
  return page.getByRole('region', { name: 'World map' })
}

test.describe('pin clusters (FR-7)', () => {
  test('rooms close together show as one circle with their count @smoke', async ({ page }) => {
    await seedRoomsAt(CLUJ)

    await page.goto('/')

    await expect(page.getByRole('button', { name: '3 chatrooms' })).toHaveText('3')
    await expect(pin(page, 1)).toHaveCount(0)
  })

  test('a click on a circle zooms in on its rooms, and creates no room', async ({ page }) => {
    await seedRoomsAt(CLUJ)
    await page.goto('/')

    await page.getByRole('button', { name: '3 chatrooms' }).click()

    for (const id of [1, 2, 3]) await expect(pin(page, id)).toBeVisible()
    await expect(page.getByRole('button', { name: '3 chatrooms' })).toHaveCount(0)
    await expect(page.getByText('Click on the map to start a chat')).toBeVisible()
    await expect(pin(page, 4)).toHaveCount(0)
  })

  test('Enter on a focused circle zooms in and moves the focus to its first room', async ({
    page,
  }) => {
    await seedRoomsAt(CLUJ)
    await page.goto('/')

    await page.getByRole('button', { name: '3 chatrooms' }).focus()
    await page.keyboard.press('Enter')

    for (const id of [1, 2, 3]) await expect(pin(page, id)).toBeVisible()
    await expect(pin(page, 1)).toBeFocused()
    await expect(pin(page, 4)).toHaveCount(0)
  })

  // With the focus on the map, a second Enter would create a room at its centre (FR-2).
  test('Enter on a circle never creates a room, even while some of its rooms stay grouped', async ({
    page,
  }) => {
    await seedRoomsAt(NEAR_AND_FAR)
    await page.goto('/')

    await page.getByRole('button', { name: '3 chatrooms' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: '2 chatrooms' })).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(pin(page, 1)).toBeFocused()
    await expect(pin(page, 2)).toBeVisible()
    await expect(pin(page, 4)).toHaveCount(0)
    await expect(page.getByText('Click on the map to start a chat')).toBeVisible()
  })

  test('zooming in on a circle keeps its rooms clear of the chat panel', async ({ page }) => {
    // Side by side, east to west: centred on the whole map, the pair would reach under the panel.
    // Room 3, far away in Lisbon, is open with a long chat, so the panel takes the map's height.
    await seedRoomsAt([
      { lat: 46.77, lng: 23.59 },
      { lat: 46.77, lng: 23.6 },
      { lat: 38.72, lng: -9.14 },
    ])
    await seedMessages(3, 30)
    await page.goto('/?room=3')
    await expect(
      page.getByRole('log', { name: 'Messages' }).getByText('Message 30', { exact: true }),
    ).toBeVisible()

    await page.getByRole('button', { name: '2 chatrooms' }).click()

    const panel = page.getByRole('complementary', { name: 'Chat' })
    for (const id of [1, 2]) {
      await expect(pin(page, id)).toBeVisible()
      expect(await overlap(pin(page, id), panel)).toBe(false)
    }
  })

  test('on a phone, zooming in on a circle keeps its rooms below the chat panel', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    // North to south, about 22 kilometres apart. The panel spans the map's width on a phone, so
    // centred on the whole map once zoomed in, the northern pin would reach under it.
    await seedRoomsAt([
      { lat: 46.87, lng: 23.59 },
      { lat: 46.67, lng: 23.59 },
    ])
    await page.goto('/')

    await page.getByRole('button', { name: '2 chatrooms' }).click()

    const panel = page.getByRole('complementary', { name: 'Chat' })
    for (const id of [1, 2]) {
      await expect(pin(page, id)).toBeInViewport({ ratio: 1 })
      expect(await below(pin(page, id), panel)).toBe(true)
    }
  })

  test('on a tablet, zooming in on a circle keeps its rooms clear of a tall chat panel', async ({
    page,
  }) => {
    await page.setViewportSize(TABLET)
    // Room 3, far away in Lisbon, is open with a long chat: the panel takes the map's height and
    // leaves only the strip on its left.
    await seedRoomsAt([...WESTERN_PAIR, { lat: 38.72, lng: -9.14 }])
    await seedMessages(3, 30)
    await page.goto('/?room=3')
    await expect(
      page.getByRole('log', { name: 'Messages' }).getByText('Message 30', { exact: true }),
    ).toBeVisible()

    await page.getByRole('button', { name: '2 chatrooms' }).click()

    const panel = page.getByRole('complementary', { name: 'Chat' })
    for (const id of [1, 2]) {
      await expect(pin(page, id)).toBeInViewport({ ratio: 1 })
      expect(await overlap(pin(page, id), panel)).toBe(false)
    }
  })

  test("opening a room from a circle keeps the circle's other rooms clear of the panel", async ({
    page,
  }) => {
    // East to west, wider than tall: below the short start panel they would fit a level deeper,
    // but the panel grows down over that space as soon as room 1 opens with its long chat.
    await seedRoomsAt([
      { lat: 47, lng: 15 },
      { lat: 47, lng: 15.04 },
    ])
    await seedMessages(1, 30)
    await page.goto('/')
    await page.getByRole('button', { name: '2 chatrooms' }).click()

    await pin(page, 1).click()

    await expect(
      page.getByRole('log', { name: 'Messages' }).getByText('Message 30', { exact: true }),
    ).toBeVisible()
    await expect(pin(page, 2)).toBeInViewport({ ratio: 1 })
    expect(await overlap(pin(page, 2), page.getByRole('complementary', { name: 'Chat' }))).toBe(
      false,
    )
  })

  test('a click on a circle zooms in even when the window is too short to fit its rooms', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 300 })
    // A column of three rooms, the first in the middle: one circle about 70 pixels tall.
    await seedRoomsAt([
      { lat: 47, lng: 23.59 },
      { lat: 48.05, lng: 23.59 },
      { lat: 45.95, lng: 23.59 },
    ])
    await page.goto('/')
    await expect(zoomLevel(page)).toHaveAttribute('data-zoom', '5')

    await page.getByRole('button', { name: '3 chatrooms' }).click()

    await expect(zoomLevel(page)).not.toHaveAttribute('data-zoom', '5')
  })

  test('rooms at the very same spot come apart at the deepest zoom, and each one opens', async ({
    page,
  }) => {
    const spot = CLUJ[0] ?? { lat: 0, lng: 0 }
    await seedRoomsAt([spot, spot])
    await page.goto('/')

    await page.getByRole('button', { name: '2 chatrooms' }).click()

    await expect(zoomLevel(page)).toHaveAttribute('data-zoom', '19')
    expect(await overlap(pin(page, 1), pin(page, 2))).toBe(false)
    await pin(page, 1).click()
    await expect(page.getByRole('heading', { name: 'Chatroom 1' })).toBeVisible()
    await pin(page, 2).click()
    await expect(page.getByRole('heading', { name: 'Chatroom 2' })).toBeVisible()
  })

  test("a room at the open room's spot keeps a pin of its own that opens it", async ({ page }) => {
    const spot = CLUJ[0] ?? { lat: 0, lng: 0 }
    await seedRoomsAt([spot, spot])

    await page.goto('/?room=1')

    await expect(pin(page, 1)).toHaveClass(/room-pin--active/)
    expect(await overlap(pin(page, 1), pin(page, 2))).toBe(false)
    await pin(page, 2).click()
    await expect(page.getByRole('heading', { name: 'Chatroom 2' })).toBeVisible()
  })

  test("the open room's pin stays out of circles", async ({ page }) => {
    await seedRoomsAt(CLUJ)

    await page.goto('/?room=2')

    await expect(pin(page, 2)).toHaveClass(/room-pin--active/)
    await expect(page.getByRole('button', { name: '2 chatrooms' })).toHaveText('2')
  })
})
