import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

/** The names under the stack template's top-level `Parameters` key. */
function templateParameters(): string[] {
  const template = read('infra/aws/hello-world-demo.yaml')
  const section = template.slice(
    template.indexOf('\nParameters:\n'),
    template.indexOf('\nConditions:\n'),
  )
  return [...section.matchAll(/^ {2}(\w+):$/gm)].map(([, name]) => name ?? '')
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
})
