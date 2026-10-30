// Stop hook: before Claude ends a turn, type-check the project and lint the TypeScript and Vue
// files it changed. On failure it blocks once (exit code 2 sends the errors back to Claude).
// When Claude is already continuing because of this hook, it only warns, so it can't loop.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const input = JSON.parse(readFileSync(0, 'utf8'))

// --untracked-files=all lists each new file, not just its new folder.
const changedFiles = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], {
  cwd: root,
  encoding: 'utf8',
})
  .stdout.split('\n')
  .map((line) => line.slice(3).split(' -> ').pop()?.trim() ?? '')
  .filter((file) => /\.(ts|mts|vue)$/.test(file) && existsSync(join(root, file)))
if (changedFiles.length === 0) process.exit(0)

const problems = []
const typeCheck = run('node_modules/vue-tsc/bin/vue-tsc.js', ['--build'])
if (typeCheck.status !== 0) problems.push(`vue-tsc --build:\n${typeCheck.output}`)
const lint = run('node_modules/eslint/bin/eslint.js', changedFiles)
if (lint.status !== 0) problems.push(`eslint:\n${lint.output}`)
if (problems.length === 0) process.exit(0)

process.stderr.write(`Type-check or lint fails:\n\n${problems.join('\n\n')}\n`)
process.exit(input.stop_hook_active ? 0 : 2)

/** Runs a tool's JS entry point with the current Node, so no shell shims are needed on Windows. */
function run(entry, args) {
  const entryPath = join(root, entry)
  if (!existsSync(entryPath)) return { status: 0, output: '' } // dependencies not installed yet
  const result = spawnSync(process.execPath, [entryPath, ...args], { cwd: root, encoding: 'utf8' })
  return { status: result.status ?? 1, output: `${result.stdout}${result.stderr}`.trim() }
}
