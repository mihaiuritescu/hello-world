import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/database.ts'

/** Empties every table and restarts the ids at 1, so each test starts from a known state. */
export async function resetDatabase(db: Kysely<Database>): Promise<void> {
  // FOREIGN_KEY_CHECKS is a session setting, so every statement runs on the same connection.
  await db.connection().execute(async (connection) => {
    await sql`SET FOREIGN_KEY_CHECKS = 0`.execute(connection)
    try {
      await sql`TRUNCATE TABLE messages`.execute(connection)
      await sql`TRUNCATE TABLE rooms`.execute(connection)
    } finally {
      await sql`SET FOREIGN_KEY_CHECKS = 1`.execute(connection)
    }
  })
}
