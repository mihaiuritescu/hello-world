import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { resetDatabase } from './test/reset-db.ts'
import { createTestApp, type TestApp } from './test/test-app.ts'

describe('rate limits', () => {
  let testApp: TestApp | undefined

  afterEach(async () => {
    await testApp?.close()
    testApp = undefined
  })

  /** The app with small limits, on an empty database. */
  async function appWithLimits(env: Record<string, string>): Promise<FastifyInstance> {
    testApp = await createTestApp(env)
    await resetDatabase(testApp.db)
    return testApp.app
  }

  function createRoom(app: FastifyInstance, headers: Record<string, string> = {}) {
    return app.inject({ method: 'POST', url: '/api/rooms', payload: { lat: 1, lng: 1 }, headers })
  }

  function sendMessage(app: FastifyInstance, roomId: number) {
    return app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/messages`,
      payload: { clientId: randomUUID(), authorName: 'Alice', body: 'Hello' },
    })
  }

  async function roomCount(app: FastifyInstance): Promise<number> {
    const response = await app.inject({ method: 'GET', url: '/api/rooms' })
    return response.json<{ rooms: unknown[] }>().rooms.length
  }

  it('answers 429 RATE_LIMITED, with Retry-After, once a client creates rooms too fast', async () => {
    const app = await appWithLimits({ RATE_LIMIT_ROOMS_PER_MINUTE: '2' })
    expect((await createRoom(app)).statusCode).toBe(201)
    expect((await createRoom(app)).statusCode).toBe(201)

    const limited = await createRoom(app)

    expect(limited.statusCode).toBe(429)
    expect(limited.json()).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: expect.stringMatching(/^Too many requests\. Try again in .+\.$/),
      code: 'RATE_LIMITED',
    })
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0)
    expect(await roomCount(app)).toBe(2)
  })

  it('stores no message once a client sends too fast', async () => {
    const app = await appWithLimits({ RATE_LIMIT_MESSAGES_PER_MINUTE: '1' })
    await createRoom(app)
    expect((await sendMessage(app, 1)).statusCode).toBe(201)

    const limited = await sendMessage(app, 1)

    expect(limited.statusCode).toBe(429)
    expect(limited.json<{ code: string }>().code).toBe('RATE_LIMITED')
    const list = await app.inject({ method: 'GET', url: '/api/rooms/1/messages' })
    expect(list.json<{ messages: unknown[] }>().messages).toHaveLength(1)
  })

  it('limits reads on their own, without using up the room creations', async () => {
    const app = await appWithLimits({ RATE_LIMIT_API_PER_MINUTE: '2' })
    await roomCount(app)
    await roomCount(app)

    const limited = await app.inject({ method: 'GET', url: '/api/rooms' })

    expect(limited.statusCode).toBe(429)
    expect((await createRoom(app)).statusCode).toBe(201)
  })

  it('never limits the health checks', async () => {
    const app = await appWithLimits({ RATE_LIMIT_API_PER_MINUTE: '1' })

    for (const url of ['/healthz', '/healthz', '/readyz', '/readyz']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200)
    }
  })

  it('counts each client behind the trusted proxy on its own', async () => {
    const app = await appWithLimits({ TRUST_PROXY: '127.0.0.1', RATE_LIMIT_ROOMS_PER_MINUTE: '1' })
    expect((await createRoom(app, { 'x-forwarded-for': '203.0.113.1' })).statusCode).toBe(201)
    expect((await createRoom(app, { 'x-forwarded-for': '203.0.113.1' })).statusCode).toBe(429)

    expect((await createRoom(app, { 'x-forwarded-for': '203.0.113.2' })).statusCode).toBe(201)
  })

  it('ignores X-Forwarded-For when no proxy is trusted, so a client cannot dodge its limit', async () => {
    const app = await appWithLimits({ RATE_LIMIT_ROOMS_PER_MINUTE: '1' })
    expect((await createRoom(app, { 'x-forwarded-for': '203.0.113.1' })).statusCode).toBe(201)

    const dodge = await createRoom(app, { 'x-forwarded-for': '203.0.113.2' })

    expect(dodge.statusCode).toBe(429)
  })
})
