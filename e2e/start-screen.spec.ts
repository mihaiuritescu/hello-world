import { expect, test } from './fixtures.ts'
import { overlap } from './layout.ts'

test.describe('start screen and header (FR-1, FR-10)', () => {
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

  test('names the app, says what it does and counts who is online, in a header', async ({
    page,
  }) => {
    await page.goto('/')

    const header = page.getByRole('banner')
    await expect(header.getByRole('heading', { level: 1, name: 'Hello World' })).toBeVisible()
    await expect(header).toContainText(
      'Drop a pin anywhere on the map and chat with whoever joins you.',
    )
    await expect(header).toContainText('1 online')
  })

  test('keeps the zoom controls clear of the header', async ({ page }) => {
    await page.goto('/')

    const header = page.getByRole('banner')
    const zoomIn = page.getByRole('button', { name: 'Zoom in' })
    await expect(zoomIn).toBeVisible()
    expect(await overlap(header, zoomIn)).toBe(false)
  })

  test('keeps the map attribution clear of the chat panel', async ({ page }) => {
    await page.goto('/')

    const panel = page.getByRole('complementary', { name: 'Chat' })
    const attribution = page.locator('.leaflet-control-attribution')
    await expect(attribution).toBeVisible()
    expect(await overlap(panel, attribution)).toBe(false)
  })
})
