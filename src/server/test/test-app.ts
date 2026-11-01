import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import { buildApp, type AppDeps } from '../app.ts'
import { createDb, type Database } from '../db/database.ts'
import { testConfig } from './test-config.ts'

export interface TestApp {
  app: FastifyInstance
  db: Kysely<Database>
  close(): Promise<void>
}

/**
 * Builds the real app against the test database. `env` overrides individual settings, and
 * `deps` replaces collaborators such as the broadcaster.
 */
export async function createTestApp(
  env: Record<string, string> = {},
  deps: Pick<AppDeps, 'broadcaster' | 'logStream'> = {},
): Promise<TestApp> {
  const config = testConfig(env)
  const db = createDb(config.db)
  const app = await buildApp({ config, db, ...deps })
  return {
    app,
    db,
    close: async () => {
      await app.close()
      await db.destroy()
    },
  }
}
