import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import helmet, { type FastifyHelmetOptions } from '@fastify/helmet'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Config } from './config.ts'
import type { Database } from './db/database.ts'
import { registerHealthRoutes } from './health.routes.ts'

/** The built SPA (`pnpm build`). The server serves it whenever it exists. */
const CLIENT_DIR = fileURLToPath(new URL('../../dist/client/', import.meta.url))

const OSM_TILES = 'https://tile.openstreetmap.org'

export interface AppDeps {
  config: Config
  db: Kysely<Database>
}

export async function buildApp({ config, db }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(config),
    trustProxy: config.trustProxy,
    bodyLimit: 16 * 1024,
  })

  await app.register(helmet, helmetOptions(config))
  registerHealthRoutes(app, { db, version: config.version })

  if (existsSync(join(CLIENT_DIR, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: CLIENT_DIR,
      setHeaders(reply, filePath) {
        // Vite fingerprints everything under assets/, so those files can be cached forever.
        const fingerprinted = filePath.includes(`${sep}assets${sep}`)
        reply.header(
          'Cache-Control',
          fingerprinted ? 'public, max-age=31536000, immutable' : 'no-cache',
        )
      },
    })
  }

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      code: 'NOT_FOUND',
    }),
  )

  return app
}

function loggerOptions(config: Config): FastifyServerOptions['logger'] {
  if (!config.prettyLogs) return { level: config.logLevel }
  return {
    level: config.logLevel,
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  }
}

function helmetOptions(config: Config): FastifyHelmetOptions {
  return {
    contentSecurityPolicy: {
      directives: {
        'img-src': ["'self'", 'data:', OSM_TILES],
        // Only for HTTPS deployments. On a plain-HTTP origin such as http://localhost:3000,
        // Safari would rewrite every request to https and the page would not load.
        'upgrade-insecure-requests': config.isHttps ? [] : null,
      },
    },
    strictTransportSecurity: config.isHttps ? { maxAge: 15_552_000 } : false,
    // OpenStreetMap's tile policy requires a Referer header on tile requests.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }
}
