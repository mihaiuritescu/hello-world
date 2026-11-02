import { expect, test } from './fixtures.ts'
import { overlap } from './layout.ts'

test.describe('start screen (FR-1)', () => {
  test('shows the map, its controls and the start panel @smoke', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle('Hello World')
    await expect(page.getByRole('region', { name: 'World map' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible()
    const attribution = page.locator('.leaflet-control-attribution')
    await expect(attribution).toContainText('Leaflet')
    await expect(attribution).toContainText('OpenStreetMap contributors')
    await expect(page.getByRole('complementary', { name: 'Chat' })).toContainText(
      'Click on the map to start a chat',
    )
  })

  test('keeps the map attribution clear of the chat panel', async ({ page }) => {
    await page.goto('/')

    const panel = page.getByRole('complementary', { name: 'Chat' })
    const attribution = page.locator('.leaflet-control-attribution')
    await expect(attribution).toBeVisible()
    expect(await overlap(panel, attribution)).toBe(false)
  })
})
