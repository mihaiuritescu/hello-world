import { sql, type Kysely } from 'kysely'

// A room's name, which its creator may set, and a revision that goes up with every rename, so
// clients can tell an old copy of a room from a newer one. A NULL name means the default,
// "Chatroom N". Both have defaults, so the previous version, which never writes them, keeps
// working on this schema.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE rooms
      ADD COLUMN name     VARCHAR(40)  NULL,
      ADD COLUMN revision INT UNSIGNED NOT NULL DEFAULT 0,
      ADD CONSTRAINT rooms_name_chk CHECK (CHAR_LENGTH(name) >= 1)
  `.execute(db)
}
