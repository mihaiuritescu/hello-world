import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const compose = readFileSync(new URL('../compose.yaml', import.meta.url), 'utf8')

/** The entries of one service's `ports:` list in compose.yaml, without their quotes. */
function publishedPorts(service: string): string[] {
  const start = compose.indexOf(`\n  ${service}:\n`)
  const next = compose.slice(start + 1).search(/\n {2}[\w-]+:\n/)
  const block = next === -1 ? compose.slice(start) : compose.slice(start, start + 1 + next)
  const list = /\n {4}ports:\n((?: {6}.*\n)+)/.exec(block)?.[1] ?? ''
  return [...list.matchAll(/^ {6}- ['"]?([^'"\n]+?)['"]?$/gm)].map(([, port]) => port ?? '')
}

describe('the local Docker Compose file', () => {
  it('publishes MySQL on this machine only, since its passwords are fixed test values', () => {
    expect(publishedPorts('db')).toEqual(['127.0.0.1:${DB_PORT:-3307}:3306'])
  })
})
