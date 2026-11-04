import type { Locator } from '@playwright/test'

async function boxesOf(a: Locator, b: Locator) {
  const [boxA, boxB] = await Promise.all([a.boundingBox(), b.boundingBox()])
  if (!boxA || !boxB) throw new Error('Both elements must be rendered')
  return { boxA, boxB }
}

/** Whether two rendered elements overlap on screen. */
export async function overlap(a: Locator, b: Locator): Promise<boolean> {
  const { boxA, boxB } = await boxesOf(a, b)
  return (
    boxA.x < boxB.x + boxB.width &&
    boxB.x < boxA.x + boxA.width &&
    boxA.y < boxB.y + boxB.height &&
    boxB.y < boxA.y + boxA.height
  )
}

/** Whether the first element sits wholly below the second on screen. */
export async function below(a: Locator, b: Locator): Promise<boolean> {
  const { boxA, boxB } = await boxesOf(a, b)
  return boxA.y >= boxB.y + boxB.height
}
