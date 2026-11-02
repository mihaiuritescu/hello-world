import { sql, type Kysely } from 'kysely'
import { Migrator, type MigrationResultSet } from 'kysely/migration'
import type { Database } from './database.ts'
import { migrations } from './migrations/index.ts'

const MIGRATION_TABLE = 'schema_migrations'

/**
 * Applies every pending migration. Kysely holds a MySQL named lock (GET_LOCK) while it runs,
 * so concurrent runs are safe.
 */
export function migrateToLatest(db: Kysely<Database>): Promise<MigrationResultSet> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: () => Promise.resolve(migrations) },
    migrationTableName: MIGRATION_TABLE,
    migrationLockTableName: 'schema_migrations_lock',
  })
  return migrator.migrateToLatest()
}

export interface MigrationState {
  /** Migrations the database has run that this version doesn't know. */
  unknown: string[]
  /** Migrations this version knows that the database hasn't run. */
  pending: string[]
}

/**
 * Compares the database's migrations with this version's. Kysely refuses to migrate a database
 * that has run a migration it doesn't know, even with nothing pending, so the migrate step looks
 * first.
 */
export async function migrationState(db: Kysely<Database>): Promise<MigrationState> {
  const executed = new Set(await executedMigrations(db))
  return {
    unknown: [...executed].filter((name) => !Object.hasOwn(migrations, name)),
    pending: Object.keys(migrations).filter((name) => !executed.has(name)),
  }
}

async function executedMigrations(db: Kysely<Database>): Promise<string[]> {
  const { rows: tables } = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = ${MIGRATION_TABLE}
  `.execute(db)
  if (tables.length === 0) return []

  const { rows } = await sql<{ name: string }>`
    SELECT name FROM ${sql.table(MIGRATION_TABLE)} ORDER BY name
  `.execute(db)
  return rows.map(({ name }) => name)
}
