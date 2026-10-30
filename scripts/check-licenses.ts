// Fails when an installed package's licence isn't known to be free to use.
// Run it through pnpm, which it calls to list every installed package: `pnpm check:licenses`.
import { execFileSync } from 'node:child_process'

/** SPDX ids of licences that allow free use without payment. */
const FREE_LICENSES = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'Python-2.0',
  'Unlicense',
])

/** Packages with a non-standard licence field that were reviewed by hand: name → reason. */
const REVIEWED: Record<string, string> = {}

interface LicensedPackage {
  name: string
  versions: string[]
}

const pnpm = process.env.npm_execpath
if (!pnpm) {
  console.error('Run this through pnpm: `pnpm check:licenses`.')
  process.exit(1)
}

const report = JSON.parse(
  execFileSync(process.execPath, [pnpm, 'licenses', 'list', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }),
) as Record<string, LicensedPackage[]>

const problems: string[] = []
let packageCount = 0
for (const [license, packages] of Object.entries(report)) {
  packageCount += packages.length
  if (isFree(license)) continue
  for (const { name, versions } of packages) {
    if (!(name in REVIEWED)) problems.push(`${name}@${versions.join(', ')}: ${license}`)
  }
}

if (problems.length > 0) {
  console.error(`Licences not known to be free to use:\n  ${problems.join('\n  ')}`)
  console.error('Check each one; if it is free to use, add it to REVIEWED with the reason.')
  process.exitCode = 1
} else {
  console.log(`All ${packageCount} installed packages have free-to-use licences.`)
}

/** Evaluates SPDX expressions such as "MIT", "(MIT OR Apache-2.0)" or "MIT AND ISC". */
function isFree(expression: string): boolean {
  return expression
    .replace(/[()]/g, ' ')
    .split(/\s+OR\s+/)
    .some((alternative) =>
      alternative.split(/\s+AND\s+/).every((term) => {
        const id = term.split(/\s+WITH\s+/)[0]?.trim() ?? ''
        return FREE_LICENSES.has(id)
      }),
    )
}
