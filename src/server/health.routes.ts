import type { FastifyInstance } from 'fastify'
import { sql, type Kysely } from 'kysely'
import type { Config } from './config.ts'
import type { Database } from './db/database.ts'

const READINESS_TIMEOUT_MS = 1000

interface HealthDeps {
  db: Kysely<Database>
  version: Config['version']
}

export function registerHealthRoutes(app: FastifyInstance, { db, version }: HealthDeps): void {
  // Liveness: the process answers. It never checks the database, so a database outage
  // doesn't make a load balancer restart healthy app instances.
  app.get('/healthz', () => ({ status: 'ok', version: version.app, image: version.image }))

  // Readiness: the database answers too. Used by Docker Compose, CI and deploy smoke tests.
  app.get('/readyz', async (request, reply) => {
    try {
      await withTimeout(sql`SELECT 1`.execute(db), READINESS_TIMEOUT_MS)
      return { status: 'ok' }
    } catch (error) {
      request.log.warn({ err: error }, 'readiness check failed')
      return reply.code(503).send({ status: 'unavailable' })
    }
  })
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}
