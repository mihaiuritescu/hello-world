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

  test('keeps the description in the header on a phone, cut to one line', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto('/')

    const description = page.getByRole('banner').getByText('Drop a pin anywhere on the map')
    await expect(description).toBeVisible()
    await expect(page.getByRole('banner')).toContainText('1 online')
  })

  test('keeps the zoom controls clear of the header', async ({ page }) => {
    await page.goto('/')

    const header = page.getByRole('banner')
    const zoomIn = page.getByRole('button', { name: 'Zoom in' })
    await expect(zoomIn).toBeVisible()
    expect(await overlap(header, zoomIn)).toBe(false)
  })

  // An iPhone 14, whose width the panel spans, and a Pixel 7, where the panel is 360 px wide and
  // still reaches over the zoom controls.
  for (const width of [390, 412]) {
    test(`keeps the zoom controls usable beside the chat panel on a ${width} px phone`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 })

      await page.goto('/')

      const panel = page.getByRole('complementary', { name: 'Chat' })
      const zoomIn = page.getByRole('button', { name: 'Zoom in' })
      const zoomOut = page.getByRole('button', { name: 'Zoom out' })
      await expect(panel).toBeVisible()
      await expect(zoomOut).toBeVisible()
      expect(await overlap(panel, zoomIn)).toBe(false)
      expect(await overlap(panel, zoomOut)).toBe(false)
      await zoomIn.click()
      await expect(page.getByRole('region', { name: 'World map' })).toHaveAttribute(
        'data-zoom',
        '6',
      )
    })
  }

  test('keeps the map attribution clear of the chat panel', async ({ page }) => {
    await page.goto('/')

    const panel = page.getByRole('complementary', { name: 'Chat' })
    const attribution = page.locator('.leaflet-control-attribution')
    await expect(attribution).toBeVisible()
    expect(await overlap(panel, attribution)).toBe(false)
  })
})
