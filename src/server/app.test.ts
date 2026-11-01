import { Writable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, type TestApp } from './test/test-app.ts'

describe('app', () => {
  let testApp: TestApp

  beforeAll(async () => {
    testApp = await createTestApp({ APP_VERSION: 'abc1234' })
  })

  afterAll(async () => {
    await testApp.close()
  })

  describe('security headers', () => {
    it('allow OpenStreetMap tiles and never upgrade plain-HTTP requests', async () => {
      const response = await testApp.app.inject('/healthz')

      const csp = response.headers['content-security-policy']
      expect(csp).toContain("img-src 'self' data: https://tile.openstreetmap.org")
      expect(csp).not.toContain('upgrade-insecure-requests')
      expect(response.headers['strict-transport-security']).toBeUndefined()
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    })

    it('allow fonts and stylesheets only from the app itself', async () => {
      const response = await testApp.app.inject('/healthz')

      const csp = String(response.headers['content-security-policy'])
      expect(csp).toContain("font-src 'self'")
      expect(csp).toContain("style-src 'self' 'unsafe-inline'")
      expect(csp).not.toMatch(/(^|\s)https:(\s|;|$)/)
    })

    it('add HTTPS-only headers when the public URL uses https', async () => {
      const httpsApp = await createTestApp({ PUBLIC_URL: 'https://chat.example.com' })
      try {
        const response = await httpsApp.app.inject('/healthz')

        expect(response.headers['content-security-policy']).toContain('upgrade-insecure-requests')
        expect(response.headers['strict-transport-security']).toContain('max-age=')
      } finally {
        await httpsApp.close()
      }
    })
  })

  describe('health routes', () => {
    it('report liveness with the running version', async () => {
      const response = await testApp.app.inject('/healthz')

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ status: 'ok', version: 'abc1234', image: null })
    })

    it('report ready when the database answers', async () => {
      const response = await testApp.app.inject('/readyz')

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ status: 'ok' })
    })

    it('report unavailable when the database is unreachable', async () => {
      const offlineApp = await createTestApp({ DB_PORT: '1' })
      try {
        const response = await offlineApp.app.inject('/readyz')

        expect(response.statusCode).toBe(503)
        expect(response.json()).toEqual({ status: 'unavailable' })
      } finally {
        await offlineApp.close()
      }
    })
  })

  describe('robustness', () => {
    it('limits how long a client may take to send a request', () => {
      expect(testApp.app.server.requestTimeout).toBe(30_000)
    })

    it('keeps SQL, with the values it carries, out of error logs', async () => {
      let logs = ''
      const logStream = new Writable({
        write(chunk: Buffer, _encoding, done) {
          logs += chunk.toString()
          done()
        },
      })
      // mysql2 attaches the SQL, with parameter values filled in, to every query error.
      const failing = Object.assign(new Error('Lock wait timeout exceeded'), {
        errno: 1205,
        sql: "insert into `messages` values (1, 'Alice', 'a private message')",
      })
      const failingApp = await createTestApp(
        { LOG_LEVEL: 'error' },
        {
          logStream,
          broadcaster: {
            roomCreated: () => {
              throw failing
            },
          },
        },
      )
      try {
        const response = await failingApp.app.inject({
          method: 'POST',
          url: '/api/rooms',
          payload: { lat: 1, lng: 1 },
        })

        expect(response.statusCode).toBe(500)
        expect(logs).toContain('1205')
        expect(logs).not.toContain('a private message')
      } finally {
        await failingApp.close()
      }
    })
  })

  it('answers unknown routes with a 404 in the standard error shape', async () => {
    const response = await testApp.app.inject('/api/nothing-here')

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })
})
