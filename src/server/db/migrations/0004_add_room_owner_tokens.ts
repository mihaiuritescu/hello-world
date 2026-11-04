import { sql, type Kysely } from 'kysely'

// The SHA-256 of the token a room's creator got back, which proves who may rename or delete the
// room. Rooms from before this migration have none, so nobody can change them.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE rooms ADD COLUMN owner_token_hash BINARY(32) NULL`.execute(db)
}
