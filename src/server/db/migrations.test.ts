import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testConfig } from '../test/test-config.ts'
import { createDb, type Database } from './database.ts'
import { migrateToLatest } from './migrator.ts'

const ER_CHECK_CONSTRAINT_VIOLATED = 3819

describe('migrations', () => {
  let db: Kysely<Database>

  beforeAll(() => {
    db = createDb(testConfig().db)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('create the rooms and messages tables', async () => {
    const { rows } = await sql<{ name: string }>`
      SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()
    `.execute(db)

    expect(rows.map((row) => row.name)).toEqual(expect.arrayContaining(['rooms', 'messages']))
  })

  it('do nothing when the database is already up to date', async () => {
    const { error, results } = await migrateToLatest(db)

    expect(error).toBeUndefined()
    expect(results).toEqual([])
  })

  it('enforce coordinate ranges in the database', async () => {
    await expect(
      sql`INSERT INTO rooms (lat, lng) VALUES (91, 0)`.execute(db),
    ).rejects.toMatchObject({ errno: ER_CHECK_CONSTRAINT_VIOLATED })
  })

  // Rows written by the previous version, which knows nothing of names or owners.
  it('give a room no name, revision 0 and no owner unless told otherwise', async () => {
    const { insertId } = await sql`INSERT INTO rooms (lat, lng) VALUES (1, 1)`.execute(db)

    const { rows } = await sql<{ name: string | null; revision: number; owner: Buffer | null }>`
      SELECT name, revision, owner_token_hash AS owner FROM rooms WHERE id = ${insertId}
    `.execute(db)

    expect(rows).toEqual([{ name: null, revision: 0, owner: null }])
  })

  it('reject an empty room name in the database', async () => {
    await expect(
      sql`INSERT INTO rooms (lat, lng, name) VALUES (0, 0, '')`.execute(db),
    ).rejects.toMatchObject({ errno: ER_CHECK_CONSTRAINT_VIOLATED })
  })
})
