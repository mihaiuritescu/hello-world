// PostToolUse hook: formats the file Claude just edited, then lints it.
// It never blocks. Exit code 2 only passes the remaining lint errors back to Claude.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { extname, isAbsolute, join, relative } from 'node:path'

const PRETTIER_EXTENSIONS = new Set([
  '.ts',
  '.mts',
  '.vue',
  '.js',
  '.mjs',
  '.json',
  '.css',
  '.html',
  '.yaml',
  '.yml',
])
const ESLINT_EXTENSIONS = new Set(['.ts', '.mts', '.vue'])

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const input = JSON.parse(readFileSync(0, 'utf8'))
const filePath = input.tool_input?.file_path
if (!filePath) process.exit(0)

const relativePath = relative(root, filePath)
const outsideProject = relativePath.startsWith('..') || isAbsolute(relativePath)
if (outsideProject || relativePath.startsWith('node_modules')) process.exit(0)

const extension = extname(filePath)
if (PRETTIER_EXTENSIONS.has(extension)) {
  run('node_modules/prettier/bin/prettier.cjs', ['--write', '--log-level', 'warn', filePath])
}
if (ESLINT_EXTENSIONS.has(extension)) {
  const lint = run('node_modules/eslint/bin/eslint.js', ['--fix', filePath])
  if (lint.status !== 0) {
    process.stderr.write(`ESLint still reports problems in ${relativePath}:\n${lint.output}\n`)
    process.exit(2)
  }
}

/** Runs a tool's JS entry point with the current Node, so no shell shims are needed on Windows. */
function run(entry, args) {
  const entryPath = join(root, entry)
  if (!existsSync(entryPath)) return { status: 0, output: '' } // dependencies not installed yet
  const result = spawnSync(process.execPath, [entryPath, ...args], { cwd: root, encoding: 'utf8' })
  return { status: result.status ?? 1, output: `${result.stdout}${result.stderr}`.trim() }
}
