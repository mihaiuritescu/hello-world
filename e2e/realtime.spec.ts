import type { Page, WebSocketRoute } from '@playwright/test'
import { seedRooms } from './database.ts'
import { expect, test } from './fixtures.ts'

// A point on the left of the default 1280×720 viewport, clear of the chat panel on the right.
const WEST = { x: 250, y: 360 }

function messageList(page: Page) {
  return page.getByRole('log', { name: 'Messages' })
}

function connection(page: Page) {
  return page.getByRole('status', { name: 'Connection' })
}

/** Opens a room and waits until updates arrive live. */
async function openLiveRoom(page: Page, roomId: number): Promise<void> {
  await page.goto(`/?room=${roomId}`)
  await expect(connection(page)).toHaveText('Live')
}

async function post(page: Page, name: string, text: string): Promise<void> {
  await page.getByRole('textbox', { name: 'User name' }).fill(name)
  await page.getByRole('textbox', { name: 'Message' }).fill(text)
  await page.getByRole('button', { name: 'Submit' }).click()
}

/**
 * Puts the page's socket behind a switch. `drop()` cuts the connection and holds the reconnect
 * until `restore()`, so the page misses whatever happens in between.
 */
async function socketSwitch(page: Page) {
  let current: WebSocketRoute | undefined
  let held = Promise.resolve()
  let restore = () => {}
  await page.routeWebSocket(/\/socket\.io\//, async (socket) => {
    await held
    socket.connectToServer()
    current = socket
  })
  return {
    async drop() {
      held = new Promise<void>((resolve) => {
        restore = resolve
      })
      await current?.close()
    },
    restore: () => restore(),
  }
}

test.describe('real time (FR-6)', () => {
  test('a room created in one window appears in the other within a second @smoke', async ({
    page,
    secondPage,
  }) => {
    await seedRooms(1)
    await openLiveRoom(page, 1)
    await openLiveRoom(secondPage, 1)

    await page.locator('.leaflet-container').click({ position: WEST })
    await expect(page.getByRole('heading', { name: 'Chatroom 2' })).toBeVisible()

    await expect(secondPage.getByTitle('Chatroom 2')).toBeVisible({ timeout: 1_000 })
    await expect(secondPage.getByRole('heading', { name: 'Chatroom 1' })).toBeVisible()
  })

  test('messages cross between windows within a second, in one order, without duplicates', async ({
    page,
    secondPage,
  }) => {
    await seedRooms(1)
    await openLiveRoom(page, 1)
    await openLiveRoom(secondPage, 1)

    await post(page, 'Alice', 'Hello from the first window')
    await expect(
      messageList(secondPage).getByText('Hello from the first window', { exact: true }),
    ).toBeVisible({ timeout: 1_000 })
    await post(secondPage, 'Bob', 'Hello from the second window')
    await expect(
      messageList(page).getByText('Hello from the second window', { exact: true }),
    ).toBeVisible({ timeout: 1_000 })

    for (const window of [page, secondPage]) {
      await expect(messageList(window).getByRole('listitem')).toHaveText([
        /Hello from the first window/,
        /Hello from the second window/,
      ])
    }
  })

  test("a room's new name reaches the other window within a second", async ({
    page,
    secondPage,
  }) => {
    await page.goto('/')
    await page.locator('.leaflet-container').click({ position: WEST })
    await expect(page.getByRole('heading', { name: 'Chatroom 1' })).toBeVisible()
    await openLiveRoom(secondPage, 1)

    await page.getByRole('button', { name: 'Rename this room' }).click()
    await page.getByRole('textbox', { name: 'Room name' }).fill('Picnic')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(secondPage.getByRole('heading', { name: 'Picnic' })).toBeVisible({
      timeout: 1_000,
    })
    await expect(secondPage.getByTitle('Picnic')).toBeVisible()
  })

  test('a window that lost its connection catches up when it reconnects', async ({
    page,
    secondPage,
  }) => {
    await seedRooms(1)
    const secondSocket = await socketSwitch(secondPage)
    await openLiveRoom(page, 1)
    await openLiveRoom(secondPage, 1)

    await secondSocket.drop()
    await expect(connection(secondPage)).toHaveText('Reconnecting…')
    await post(page, 'Alice', 'Sent while you were away')
    await expect(
      messageList(page).getByText('Sent while you were away', { exact: true }),
    ).toBeVisible()
    await expect(messageList(secondPage).getByText('Sent while you were away')).toHaveCount(0)

    secondSocket.restore()

    await expect(connection(secondPage)).toHaveText('Live')
    await expect(
      messageList(secondPage).getByText('Sent while you were away', { exact: true }),
    ).toBeVisible()
  })
})

test.describe('online count (FR-10)', () => {
  test('the header counts the windows that have the app open, within 2 seconds', async ({
    page,
    secondPage,
  }) => {
    await page.goto('/')
    const header = page.getByRole('banner')
    await expect(header).toContainText('1 online')

    await secondPage.goto('/')
    await expect(header).toContainText('2 online', { timeout: 2_000 })

    await secondPage.close()
    await expect(header).toContainText('1 online', { timeout: 2_000 })
  })
})
