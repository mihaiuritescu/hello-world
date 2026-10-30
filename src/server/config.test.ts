import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'

describe('loadConfig', () => {
  it('works without any environment variables for a local run', () => {
    expect(loadConfig({})).toMatchObject({
      host: 'localhost',
      port: 3000,
      isHttps: false,
      trustProxy: false,
      db: { host: 'localhost', port: 3307, database: 'hello_world', caFile: undefined },
      version: { app: 'dev', image: null },
    })
  })

  it('treats empty variables as unset', () => {
    expect(loadConfig({ PORT: '', PUBLIC_URL: '' })).toMatchObject({ port: 3000, isHttps: false })
  })

  it('switches to HTTPS behaviour only for an https public URL', () => {
    expect(loadConfig({ PUBLIC_URL: 'https://chat.example.com' }).isHttps).toBe(true)
    expect(loadConfig({ PUBLIC_URL: 'http://localhost:3000' }).isHttps).toBe(false)
  })

  it('names the offending variable when a value is invalid', () => {
    expect(() => loadConfig({ PORT: 'eighty' })).toThrow(/Invalid configuration[\s\S]*PORT/)
  })
})
