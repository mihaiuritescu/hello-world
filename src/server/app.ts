import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import type { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import helmet, { type FastifyHelmetOptions } from '@fastify/helmet'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Config } from './config.ts'
import type { Database } from './db/database.ts'
import { errorBody, registerErrorHandler } from './errors.ts'
import { registerHealthRoutes } from './health.routes.ts'
import { createMessagesRepository } from './messages/messages.repository.ts'
import { registerMessageRoutes } from './messages/messages.routes.ts'
import { silentBroadcaster, type Broadcaster } from './realtime/broadcaster.ts'
import { createRoomsRepository } from './rooms/rooms.repository.ts'
import { registerRoomRoutes } from './rooms/rooms.routes.ts'

/** The built SPA (`pnpm build`). The server serves it whenever it exists. */
const CLIENT_DIR = fileURLToPath(new URL('../../dist/client/', import.meta.url))

const OSM_TILES = 'https://tile.openstreetmap.org'

export interface AppDeps {
  config: Config
  db: Kysely<Database>
  /** Announces committed changes to connected clients. Defaults to announcing nothing. */
  broadcaster?: Broadcaster
  /** Where JSON logs go. Defaults to stdout. */
  logStream?: Writable
}

export async function buildApp({
  config,
  db,
  broadcaster = silentBroadcaster,
  logStream,
}: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(config, logStream),
    trustProxy: config.trustProxy,
    bodyLimit: 16 * 1024,
    // A client gets this long to send a whole request, so slow senders can't hold sockets open.
    // It doesn't limit responses, long-polls or open WebSockets.
    requestTimeout: 30_000,
  })

  registerErrorHandler(app)
  await app.register(helmet, helmetOptions(config))
  registerHealthRoutes(app, { db, version: config.version })
  const rooms = createRoomsRepository(db)
  registerRoomRoutes(app, { rooms, broadcaster })
  registerMessageRoutes(app, { rooms, messages: createMessagesRepository(db), broadcaster })

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
    reply
      .code(404)
      .send(errorBody(404, 'NOT_FOUND', `Route ${request.method} ${request.url} not found`)),
  )

  return app
}

function loggerOptions(config: Config, stream?: Writable): FastifyServerOptions['logger'] {
  const options = {
    level: config.logLevel,
    // mysql2 attaches each failed query's SQL, with the parameter values filled in, to the error.
    // Logging it would leak author names and message bodies.
    redact: { paths: ['err.sql'], remove: true },
  }
  if (stream) return { ...options, stream }
  if (!config.prettyLogs) return options
  return {
    ...options,
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
        // Helmet's defaults allow fonts and styles from any https: origin; the app needs none.
        // Vuetify injects its theme as an inline stylesheet, hence 'unsafe-inline'.
        'font-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
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
