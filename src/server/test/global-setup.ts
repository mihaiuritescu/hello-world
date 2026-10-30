import { createDb } from '../db/database.ts'
import { migrateToLatest } from '../db/migrator.ts'
import { testConfig } from './test-config.ts'

/** Brings the test database up to date once, before any server test runs. */
export default async function setup(): Promise<void> {
  const db = createDb(testConfig().db)
  try {
    const { error } = await migrateToLatest(db)
    if (error) throw new Error('Migrating the test database failed', { cause: error })
  } finally {
    await db.destroy()
  }
}
