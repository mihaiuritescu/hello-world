import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Database } from './db/database.ts'
import { testConfig } from './test/test-config.ts'

const execFileAsync = promisify(execFile)

/** Runs the migrate step as the deploy does, against the test database. Rejects on a failure. */
function migrateStep(env: Record<string, string> = {}) {
  return execFileAsync(process.execPath, [fileURLToPath(new URL('migrate.ts', import.meta.url))], {
    env: { ...process.env, DB_NAME: 'hello_world_test', ...env },
  })
}

describe('the migrate step', () => {
  const FUTURE_MIGRATION = '9999_from_a_newer_version'
  let db: Kysely<Database>

  beforeAll(() => {
    db = createDb(testConfig().db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('leaves a database that a newer version migrated as it is, so a rollback can deploy', async () => {
    await sql`
      INSERT INTO schema_migrations (name, timestamp)
      VALUES (${FUTURE_MIGRATION}, ${new Date().toISOString()})
    `.execute(db)
    try {
      const { stdout } = await migrateStep()

      expect(stdout).toContain(`a newer version of the app ran ${FUTURE_MIGRATION}`)
    } finally {
      await sql`DELETE FROM schema_migrations WHERE name = ${FUTURE_MIGRATION}`.execute(db)
    }
  })

  it('fails, naming both sides, when the database ran a migration it does not know and misses one it needs', async () => {
    // Another line of migrations, such as a reverted one: the database lacks 0002 and has 9999.
    const { rows } = await sql<{ timestamp: string }>`
      SELECT timestamp FROM schema_migrations WHERE name = '0002_create_messages'
    `.execute(db)
    await sql`DELETE FROM schema_migrations WHERE name = '0002_create_messages'`.execute(db)
    await sql`
      INSERT INTO schema_migrations (name, timestamp)
      VALUES (${FUTURE_MIGRATION}, ${new Date().toISOString()})
    `.execute(db)
    try {
      await expect(migrateStep()).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringMatching(/9999_from_a_newer_version.*0002_create_messages/),
      })
    } finally {
      await sql`DELETE FROM schema_migrations WHERE name = ${FUTURE_MIGRATION}`.execute(db)
      await sql`
        INSERT INTO schema_migrations (name, timestamp)
        VALUES ('0002_create_messages', ${rows[0]?.timestamp ?? new Date().toISOString()})
      `.execute(db)
    }
  })

  it('fails with a hint when it cannot reach MySQL', async () => {
    await expect(migrateStep({ DB_PORT: '1' })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Cannot reach MySQL'),
    })
  })
})
