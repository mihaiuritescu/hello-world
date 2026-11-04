import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

/** The names under one top-level key of the stack template, which `nextKey` follows. */
function templateNames(key: string, nextKey: string): string[] {
  const template = read('infra/aws/hello-world-demo.yaml')
  const section = template.slice(
    template.indexOf(`\n${key}:\n`),
    template.indexOf(`\n${nextKey}:\n`),
  )
  return [...section.matchAll(/^ {2}(\w+):$/gm)].map(([, name]) => name ?? '')
}

function templateParameters(): string[] {
  return templateNames('Parameters', 'Conditions')
}

describe('the AWS runbook', () => {
  it('keeps every parameter of the stack when it updates the stack', () => {
    const runbook = read('infra/aws/RUNBOOK.md')
    const update = /```bash\n([^`]*--change-set-type UPDATE[^`]*)```/.exec(runbook)?.[1] ?? ''
    const kept = [...update.matchAll(/ParameterKey=(\w+),UsePreviousValue=true/g)].map(
      ([, name]) => name ?? '',
    )

    expect(templateParameters()).toHaveLength(6)
    expect(kept.sort()).toEqual(templateParameters().sort())
  })

  it('expects one change set row for each resource when it creates the stack', () => {
    const rows = /Expect (\d+) rows, all `Add`/.exec(read('infra/aws/RUNBOOK.md'))?.[1]

    expect(Number(rows)).toBe(templateNames('Resources', 'Outputs').length)
  })
})
