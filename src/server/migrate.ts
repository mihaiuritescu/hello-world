// Applies pending database migrations, then exits. Runs as a one-off step (`pnpm db:migrate`,
// the compose `migrate` service, or the deploy), never as part of app startup.
import { loadConfig } from './config.ts'
import { createDb } from './db/database.ts'
import { migrateToLatest } from './db/migrator.ts'

const CONNECTION_ERROR_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH'])

const config = loadConfig()
const { host, port, database } = config.db
const db = createDb(config.db)

console.log(`Migrating database "${database}" on ${host}:${port}`)
try {
  const { error, results = [] } = await migrateToLatest(db)
  for (const { status, migrationName } of results) {
    console.log(`  ${status.padEnd(7)} ${migrationName}`)
  }
  if (error) {
    console.error(
      isConnectionError(error)
        ? `Cannot reach MySQL at ${host}:${port}. Is it running? Try \`pnpm db:up\`.`
        : 'Migration failed:',
    )
    console.error(error)
    process.exitCode = 1
  } else if (results.length === 0) {
    console.log('  Already up to date.')
  }
} finally {
  await db.destroy()
}

function isConnectionError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    CONNECTION_ERROR_CODES.has(String(error.code))
  )
}
