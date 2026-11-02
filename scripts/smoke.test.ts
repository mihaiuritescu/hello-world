import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { portOf } from '../src/server/test/socket-client.ts'
import { createTestApp, type TestApp } from '../src/server/test/test-app.ts'
import { smokeTest } from './smoke.ts'

/** A test app listening on a free port, with its base URL. */
async function listening(env: Record<string, string>) {
  const testApp = await createTestApp(env)
  await testApp.app.listen({ host: '127.0.0.1', port: 0 })
  return { testApp, baseUrl: `http://127.0.0.1:${portOf(testApp.app)}` }
}

/** Starts a plain HTTP server on a free port, and returns the port. */
async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

/** A port nothing listens on: the system hands one out, and it closes again at once. */
async function freePort(): Promise<number> {
  const server = createServer()
  const port = await listen(server)
  await close(server)
  return port
}

describe('smoke test', () => {
  let healthy: Awaited<ReturnType<typeof listening>>

  beforeAll(async () => {
    healthy = await listening({ APP_VERSION: 'abc1234' })
  })

  afterAll(async () => {
    await healthy.testApp.close()
  })

  it('passes against a ready app that runs the expected version', async () => {
    await expect(smokeTest(healthy.baseUrl, 'abc1234')).resolves.toBeUndefined()
  })

  it('fails when the app runs another version', async () => {
    await expect(smokeTest(healthy.baseUrl, 'def5678')).rejects.toThrow('version abc1234')
  })

  it('fails when the app cannot reach its database', async () => {
    const { testApp, baseUrl } = await listening({ APP_VERSION: 'abc1234', DB_PORT: '1' })
    try {
      await expect(smokeTest(baseUrl, 'abc1234')).rejects.toThrow('/readyz')
    } finally {
      await testApp.close()
    }
  })

  it('fails when the app refuses the WebSocket', async () => {
    // An app whose public origin is another host refuses this origin's handshake.
    const { testApp, baseUrl } = await listening({
      APP_VERSION: 'abc1234',
      PUBLIC_URL: 'https://chat.example.com',
    })
    try {
      await expect(smokeTest(baseUrl, 'abc1234')).rejects.toThrow('WebSocket')
    } finally {
      await testApp.close()
    }
  })
})

describe('smoke test while the site comes up', () => {
  let testApp: TestApp

  beforeEach(async () => {
    testApp = await createTestApp({ APP_VERSION: 'abc1234' })
  })

  afterEach(async () => {
    await testApp.close()
  })

  it('waits while nothing answers, as while Caddy gets its certificate', async () => {
    const port = await freePort()
    const reasons: string[] = []

    // Each pause stands in for the wait between two tries; the first one starts the app.
    await smokeTest(`http://127.0.0.1:${port}`, 'abc1234', {
      pause: async (reason) => {
        reasons.push(reason)
        await testApp.app.listen({ host: '127.0.0.1', port })
      },
    })

    expect(reasons).toEqual([expect.stringContaining('ECONNREFUSED')])
  })

  it('waits while the proxy answers 502, as while the app restarts', async () => {
    const proxy = createServer((_request, response) => {
      response.writeHead(502, { connection: 'close' }).end()
    })
    const port = await listen(proxy)
    const reasons: string[] = []
    try {
      await smokeTest(`http://127.0.0.1:${port}`, 'abc1234', {
        pause: async (reason) => {
          reasons.push(reason)
          await close(proxy)
          await testApp.app.listen({ host: '127.0.0.1', port })
        },
      })
    } finally {
      if (proxy.listening) await close(proxy)
    }

    expect(reasons).toEqual(['/healthz answered 502'])
  })

  it('gives up with the reason once its patience runs out', async () => {
    const port = await freePort()

    await expect(
      smokeTest(`http://127.0.0.1:${port}`, 'abc1234', { patienceMs: 0 }),
    ).rejects.toThrow('ECONNREFUSED')
  })
})
