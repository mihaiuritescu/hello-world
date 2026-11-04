import type { Page } from '@playwright/test'
import { seedRoomsAt } from './database.ts'
import { expect, test } from './fixtures.ts'

// Three rooms in Cluj, about a kilometre apart: one spot at the opening zoom.
const CLUJ = [
  { lat: 46.77, lng: 23.59 },
  { lat: 46.78, lng: 23.6 },
  { lat: 46.76, lng: 23.58 },
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

  test('a click on a circle zooms in until its pins separate, and creates no room', async ({
    page,
  }) => {
    await seedRoomsAt(CLUJ)
    await page.goto('/')

    await page.getByRole('button', { name: '3 chatrooms' }).click()

    for (const id of [1, 2, 3]) await expect(pin(page, id)).toBeVisible()
    await expect(page.getByRole('button', { name: '3 chatrooms' })).toHaveCount(0)
    await expect(page.getByText('Click on the map to start a chat')).toBeVisible()
    await expect(pin(page, 4)).toHaveCount(0)
  })

  test('Enter on a focused circle zooms in and leaves the focus on the map', async ({ page }) => {
    await seedRoomsAt(CLUJ)
    await page.goto('/')

    await page.getByRole('button', { name: '3 chatrooms' }).focus()
    await page.keyboard.press('Enter')

    for (const id of [1, 2, 3]) await expect(pin(page, id)).toBeVisible()
    await expect(page.locator('.leaflet-container')).toBeFocused()
    await expect(pin(page, 4)).toHaveCount(0)
  })

  test('rooms at the very same spot come apart at the deepest zoom', async ({ page }) => {
    const spot = CLUJ[0] ?? { lat: 0, lng: 0 }
    await seedRoomsAt([spot, spot])
    await page.goto('/')

    await page.getByRole('button', { name: '2 chatrooms' }).click()

    await expect(zoomLevel(page)).toHaveAttribute('data-zoom', '19')
    await expect(pin(page, 1)).toBeVisible()
    await expect(pin(page, 2)).toBeVisible()
  })

  test("the open room's pin stays out of circles", async ({ page }) => {
    await seedRoomsAt(CLUJ)

    await page.goto('/?room=2')

    await expect(pin(page, 2)).toHaveClass(/room-pin--active/)
    await expect(page.getByRole('button', { name: '2 chatrooms' })).toHaveText('2')
  })
})
