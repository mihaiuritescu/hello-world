import { z } from 'zod'

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

/** Wraps a variable's schema so that an empty value (`KEY=` in a .env file) counts as unset. */
function envVar<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema)
}

const port = z.coerce.number().int().min(1).max(65_535)

// Every setting has a default that works for a local run, so no .env file is required.
const EnvSchema = z.object({
  NODE_ENV: envVar(z.string().default('development')),
  HOST: envVar(z.string().default('localhost')),
  PORT: envVar(port.default(3000)),
  LOG_LEVEL: envVar(z.enum(LOG_LEVELS).default('info')),
  PUBLIC_URL: envVar(z.url().optional()),
  TRUST_PROXY: envVar(z.string().optional()),
  DB_HOST: envVar(z.string().default('localhost')),
  DB_PORT: envVar(port.default(3307)),
  DB_USER: envVar(z.string().default('hello_world')),
  DB_PASSWORD: envVar(z.string().default('hello_world')),
  DB_NAME: envVar(z.string().default('hello_world')),
  DB_CA_FILE: envVar(z.string().optional()),
  APP_VERSION: envVar(z.string().default('dev')),
  IMAGE_DIGEST: envVar(z.string().optional()),
})

export type LogLevel = (typeof LOG_LEVELS)[number]

export interface DbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
  /** CA bundle used to verify the server certificate. TLS is on only when this is set. */
  caFile: string | undefined
}

export interface Config {
  host: string
  port: number
  logLevel: LogLevel
  /** Human-readable logs in development; JSON lines everywhere else. */
  prettyLogs: boolean
  /** True when the public origin uses HTTPS, which enables the HTTPS-only security headers. */
  isHttps: boolean
  /** Proxy addresses whose X-Forwarded-* headers are trusted, or false when clients connect directly. */
  trustProxy: string | false
  db: DbConfig
  version: { app: string; image: string | null }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = EnvSchema.safeParse(env)
  if (!parsed.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(parsed.error)}`)
  }
  const vars = parsed.data

  return {
    host: vars.HOST,
    port: vars.PORT,
    logLevel: vars.LOG_LEVEL,
    prettyLogs: vars.NODE_ENV === 'development',
    isHttps: vars.PUBLIC_URL?.startsWith('https://') ?? false,
    trustProxy: vars.TRUST_PROXY ?? false,
    db: {
      host: vars.DB_HOST,
      port: vars.DB_PORT,
      user: vars.DB_USER,
      password: vars.DB_PASSWORD,
      database: vars.DB_NAME,
      caFile: vars.DB_CA_FILE,
    },
    version: { app: vars.APP_VERSION, image: vars.IMAGE_DIGEST ?? null },
  }
}
