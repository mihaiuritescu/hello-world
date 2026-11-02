// Checks a deployed Hello World from the outside, with no AWS access: the version it runs, that it
// can reach its database, and that a browser's WebSocket connects.
//
// Usage: node scripts/smoke.ts <base URL> <expected version>
//   e.g. node scripts/smoke.ts https://1-2-3-4.sslip.io 0123456789abcdef0123456789abcdef01234567
import { setTimeout as delay } from 'node:timers/promises'
import { io } from 'socket.io-client'

const TIMEOUT_MS = 15_000
const RETRY_DELAY_MS = 2_000
/** Caddy answers these while the app behind it restarts. */
const NOT_UP_YET = new Set([502, 503, 504])

export interface SmokeOptions {
  /**
   * How long to keep trying while the site doesn't answer yet. Right after the first deploy,
   * Caddy is still getting the certificate. The default is three minutes.
   */
  patienceMs?: number
  /** Runs between two tries, with the reason the last one failed. The default waits 2 s. */
  pause?: (reason: string) => Promise<void>
}

export async function smokeTest(
  baseUrl: string,
  expectedVersion: string,
  { patienceMs = 180_000, pause = () => delay(RETRY_DELAY_MS) }: SmokeOptions = {},
): Promise<void> {
  const health = await fetchOnceUp(new URL('/healthz', baseUrl), patienceMs, pause)
  if (!health.ok) throw new Error(`/healthz answered ${health.status}`)
  const { version } = (await health.json()) as { version?: string }
  if (version !== expectedVersion) {
    throw new Error(`/healthz reports version ${String(version)}, not ${expectedVersion}`)
  }

  const ready = await fetch(new URL('/readyz', baseUrl), {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (ready.status !== 200) throw new Error(`/readyz answered ${ready.status}`)

  await connectWebSocket(baseUrl)
}

/** Fetches `url`, trying again while the site isn't up: no connection, or Caddy answers 502–504. */
async function fetchOnceUp(
  url: URL,
  patienceMs: number,
  pause: (reason: string) => Promise<void>,
): Promise<Response> {
  const deadline = Date.now() + patienceMs
  for (;;) {
    let reason: string
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!NOT_UP_YET.has(response.status)) return response
      reason = `${url.pathname} answered ${response.status}`
    } catch (error) {
      reason = describe(error)
    }
    if (Date.now() >= deadline) throw new Error(reason)
    await pause(reason)
  }
}

/** fetch keeps the reason a request failed, such as a refused connection or a TLS alert, in `cause`. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const { cause } = error
  return cause instanceof Error
    ? `${error.message} (${cause.message || cause.name})`
    : error.message
}

/** Opens and closes a socket the way the app's own pages do, with the site's Origin. */
function connectWebSocket(baseUrl: string): Promise<void> {
  const socket = io(baseUrl, {
    transports: ['websocket'],
    reconnection: false,
    timeout: TIMEOUT_MS,
    extraHeaders: { origin: new URL(baseUrl).origin },
  })
  return new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve())
    socket.once('connect_error', (error) =>
      reject(new Error(`The WebSocket didn't connect: ${error.message}`)),
    )
  }).finally(() => socket.disconnect())
}

if (import.meta.main) {
  const [baseUrl, expectedVersion] = process.argv.slice(2)
  if (!baseUrl || !expectedVersion) {
    console.error('Usage: node scripts/smoke.ts <base URL> <expected version>')
    process.exit(2)
  }
  try {
    await smokeTest(baseUrl, expectedVersion, {
      pause: async (reason) => {
        console.log(`Not up yet (${reason}); trying again in ${RETRY_DELAY_MS / 1000} s.`)
        await delay(RETRY_DELAY_MS)
      },
    })
    console.log(`OK: ${baseUrl} runs ${expectedVersion}, reaches its database, accepts WebSockets.`)
  } catch (error) {
    console.error(`FAILED: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
