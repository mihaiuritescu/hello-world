import type { Kysely } from 'kysely'
import { Migrator, type MigrationResultSet } from 'kysely/migration'
import type { Database } from './database.ts'
import { migrations } from './migrations/index.ts'

/**
 * Applies every pending migration. Kysely holds a MySQL named lock (GET_LOCK) while it runs,
 * so concurrent runs are safe.
 */
export function migrateToLatest(db: Kysely<Database>): Promise<MigrationResultSet> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: () => Promise.resolve(migrations) },
    migrationTableName: 'schema_migrations',
    migrationLockTableName: 'schema_migrations_lock',
  })
  return migrator.migrateToLatest()
}
