import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const compose = readFileSync(new URL('../compose.yaml', import.meta.url), 'utf8')

describe('the local Docker Compose file', () => {
  it('publishes MySQL on this machine only, since its passwords are fixed test values', () => {
    expect(compose).toContain("- '127.0.0.1:${DB_PORT:-3307}:3306'")
    expect(compose).not.toMatch(/- '\$\{DB_PORT/)
  })
})
