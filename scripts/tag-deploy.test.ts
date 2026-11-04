import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

/** The text of every workflow file. */
function workflows(): string {
  return readdirSync(new URL('../.github/workflows/', import.meta.url))
    .filter((file) => /\.ya?ml$/.test(file))
    .map((file) => read(`.github/workflows/${file}`))
    .join('\n')
}

/** One job of the CI workflow, from its name to the next job. */
function workflowJob(name: string): string {
  const workflow = read('.github/workflows/ci.yml')
  const start = workflow.indexOf(`\n  ${name}:\n`)
  const next = workflow.slice(start + 1).search(/\n {2}[\w-]+:\n/)
  return next === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + next)
}

describe('deploys from a tag', () => {
  it('trusts only the tags that the workflow deploys, of this one repository', () => {
    const subjects = [
      ...read('infra/aws/hello-world-demo.yaml').matchAll(/!Sub '(repo:[^']*)'/g),
    ].map(([, subject]) => subject ?? '')

    expect(read('.github/workflows/ci.yml')).toContain("tags: ['v[0-9]*']")
    expect(subjects).toEqual(
      Array.from(
        { length: 10 },
        (_, digit) => `repo:\${GitHubOidcRepository}:ref:refs/tags/v${digit}*`,
      ),
    )
    // IAM's * also matches : and @, so a wildcard before the tag would let another repository's
    // free-text claims, such as an environment name, complete the pattern.
    expect(subjects.filter((subject) => subject.split(':ref:')[0]?.includes('*'))).toEqual([])
  })

  it('takes the repository part of the subject from a parameter that holds no wildcard', () => {
    const template = read('infra/aws/hello-world-demo.yaml')
    const parameter = template.slice(template.indexOf('\n  GitHubOidcRepository:\n'))
    const allowed = /AllowedPattern: '([^']*)'/.exec(parameter)?.[1] ?? ''

    expect(new RegExp(allowed).test('mihaiuritescu@69866646/hello-world@1439070538')).toBe(true)
    expect(new RegExp(allowed).test('octo-org/octo-repo')).toBe(true)
    for (const value of ['*/*@1439070538', 'a@1/b@2:environment:x', 'a?/b']) {
      expect(new RegExp(allowed).test(value)).toBe(false)
    }
  })

  it('gives the AWS token only to the deploy script', () => {
    const deploy = workflowJob('deploy')
    // Every uses: and run: line, whether or not the step starts with it.
    const steps = [...deploy.matchAll(/^\s+(?:- )?(uses|run): (.*)$/gm)].map(
      ([, key, value]) => `${key}: ${value}`,
    )

    expect(workflows().match(/id-token: write/g)).toHaveLength(1)
    expect(workflows()).not.toContain('write-all')
    expect(deploy).toContain('id-token: write')
    expect(steps).toEqual([
      'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
      'run: bash infra/aws/ci-deploy.sh "$IMAGE_DIGEST"',
    ])
  })
})
