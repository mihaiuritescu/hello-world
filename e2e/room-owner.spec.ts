import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// A point on the left of the default 1280×720 viewport, clear of the chat panel on the right.
const WEST = { x: 250, y: 360 }

function heading(page: Page, name: string) {
  return page.getByRole('heading', { level: 2, name, exact: true })
}

/** Creates a room with a click on the map, which makes this window its creator. */
async function createRoom(page: Page): Promise<void> {
  await page.locator('.leaflet-container').click({ position: WEST })
  await expect(heading(page, 'Chatroom 1')).toBeVisible()
}

async function rename(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Rename this room' }).click()
  await page.getByRole('textbox', { name: 'Room name' }).fill(name)
  await page.getByRole('button', { name: 'Save' }).click()
}

test.describe("a room's creator (FR-8)", () => {
  test('renames the room, and its title, number and pin follow @smoke', async ({ page }) => {
    await page.goto('/')
    await createRoom(page)

    await rename(page, 'Picnic by the lake')

    await expect(heading(page, 'Picnic by the lake')).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Chat' })).toContainText('Chatroom 1')
    await expect(page.getByTitle('Picnic by the lake')).toBeVisible()
    await expect(page.getByTitle('Chatroom 1')).toHaveCount(0)
  })

  test('sees a name with markup as plain text, which runs nothing', async ({ page }) => {
    const name = '<img src=x onerror=alert(1)>'
    const dialogs: string[] = []
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message())
      void dialog.dismiss()
    })
    await page.goto('/')
    await createRoom(page)

    await rename(page, name)

    await expect(heading(page, name)).toBeVisible()
    await expect(page.getByTitle(name)).toBeVisible()
    await page.reload()
    await expect(heading(page, name)).toBeVisible()
    await expect(page.locator('img[src="x"], [onerror]')).toHaveCount(0)
    expect(dialogs).toEqual([])
  })

  test('brings back the default name by saving an empty one', async ({ page }) => {
    await page.goto('/')
    await createRoom(page)
    await rename(page, 'Picnic')
    await expect(heading(page, 'Picnic')).toBeVisible()

    await rename(page, '')

    await expect(heading(page, 'Chatroom 1')).toBeVisible()
    await expect(page.getByTitle('Chatroom 1')).toBeVisible()
  })

  test('keeps the right to rename after a reload', async ({ page }) => {
    await page.goto('/')
    await createRoom(page)

    await page.reload()

    await expect(page.getByRole('button', { name: 'Rename this room' })).toBeVisible()
  })

  test('is the only one offered a rename', async ({ page, secondPage }) => {
    await page.goto('/')
    await createRoom(page)

    await secondPage.goto('/?room=1')

    await expect(heading(secondPage, 'Chatroom 1')).toBeVisible()
    await expect(secondPage.getByRole('button', { name: 'Rename this room' })).toHaveCount(0)
  })
})

test.describe("a room's creator (FR-9)", () => {
  test('deletes an empty room, and every window goes back to the start screen @smoke', async ({
    page,
    secondPage,
  }) => {
    await page.goto('/')
    await createRoom(page)
    await secondPage.goto('/?room=1')
    await expect(secondPage.getByRole('status', { name: 'Connection' })).toHaveText('Live')

    await page.getByRole('button', { name: 'Delete this room' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()

    for (const window of [page, secondPage]) {
      await expect(window.getByText('Chatroom 1 was deleted.')).toBeVisible({ timeout: 1_000 })
      await expect(window.getByText('Click on the map to start a chat')).toBeVisible()
      await expect(window.getByTitle('Chatroom 1')).toHaveCount(0)
      await expect(window).not.toHaveURL(/room=/)
    }
  })

  test("never gives a deleted room's number to a new one", async ({ page }) => {
    await page.goto('/')
    await createRoom(page)
    await page.getByRole('button', { name: 'Delete this room' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('Click on the map to start a chat')).toBeVisible()

    await page.locator('.leaflet-container').click({ position: WEST })

    await expect(heading(page, 'Chatroom 2')).toBeVisible()
  })

  test('can no longer delete a room once it has a message', async ({ page }) => {
    await page.goto('/')
    await createRoom(page)
    await expect(page.getByRole('button', { name: 'Delete this room' })).toBeVisible()

    await page.getByRole('textbox', { name: 'User name' }).fill('Alice')
    await page.getByRole('textbox', { name: 'Message' }).fill('First!')
    await page.getByRole('button', { name: 'Submit' }).click()

    await expect(page.getByRole('log', { name: 'Messages' }).getByText('First!')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete this room' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Rename this room' })).toBeVisible()
  })
})
