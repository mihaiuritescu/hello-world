import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

/** One job of the CI workflow, from its name to the next job. */
function workflowJob(name: string): string {
  const workflow = read('.github/workflows/ci.yml')
  const start = workflow.indexOf(`\n  ${name}:\n`)
  const next = workflow.slice(start + 1).search(/\n {2}[\w-]+:\n/)
  return next === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + next)
}

describe('deploys from a tag', () => {
  it('trusts only the tags that the workflow deploys: v and a digit', () => {
    const tagPatterns = [
      ...read('infra/aws/hello-world-demo.yaml').matchAll(/refs\/tags\/[^'\s]*/g),
    ]

    expect(read('.github/workflows/ci.yml')).toContain("tags: ['v[0-9]*']")
    expect(tagPatterns.map(([pattern]) => pattern)).toEqual(
      Array.from({ length: 10 }, (_, digit) => `refs/tags/v${digit}*`),
    )
  })

  it('gives the AWS token only to the deploy script', () => {
    const deploy = workflowJob('deploy')
    const tokenJobs = read('.github/workflows/ci.yml').match(/id-token: write/g) ?? []

    expect(deploy).toContain('id-token: write')
    expect(tokenJobs).toHaveLength(1)
    expect([...deploy.matchAll(/^\s+- (?:uses|run): .*$/gm)].map(([step]) => step.trim())).toEqual([
      '- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
    ])
    expect(deploy).toMatch(/run: bash infra\/aws\/ci-deploy\.sh "\$IMAGE_DIGEST"/)
  })
})
