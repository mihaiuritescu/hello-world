// Applies pending database migrations, then exits. Runs as a one-off step (`pnpm db:migrate`,
// the compose `migrate` service, or the deploy), never as part of app startup.
import { loadConfig } from './config.ts'
import { createDb } from './db/database.ts'
import { migrateToLatest, migrationState } from './db/migrator.ts'

const CONNECTION_ERROR_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH'])

const config = loadConfig()
const { host, port, database } = config.db
const db = createDb(config.db)

console.log(`Migrating database "${database}" on ${host}:${port}`)
try {
  const { unknown, pending } = await migrationState(db)
  if (unknown.length > 0 && pending.length === 0) {
    // A rollback. Migrations only add, so this version still runs on the newer schema.
    console.log(`  Left as it is: a newer version of the app ran ${unknown.join(', ')}.`)
  } else if (unknown.length > 0) {
    // The histories diverged, as after a reverted migration: no version fits this database.
    console.error(
      `The database ran ${unknown.join(', ')}, which this version doesn't know, ` +
        `but not ${pending.join(', ')}, which it needs. Fix the migrations before deploying.`,
    )
    process.exitCode = 1
  } else {
    const { error, results = [] } = await migrateToLatest(db)
    for (const { status, migrationName } of results) {
      console.log(`  ${status.padEnd(7)} ${migrationName}`)
    }
    if (error) fail(error)
    else if (results.length === 0) console.log('  Already up to date.')
  }
} catch (error) {
  fail(error)
} finally {
  await db.destroy()
}

function fail(error: unknown): void {
  console.error(
    isConnectionError(error)
      ? `Cannot reach MySQL at ${host}:${port}. Is it running? Try \`pnpm db:up\`.`
      : 'Migration failed:',
  )
  console.error(error)
  process.exitCode = 1
}

function isConnectionError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    CONNECTION_ERROR_CODES.has(String(error.code))
  )
}
