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

  it('answers unknown routes with a 404 in the standard error shape', async () => {
    const response = await testApp.app.inject('/api/nothing-here')

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })
})
