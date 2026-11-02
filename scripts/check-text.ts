// Fails when a text file in the repository holds a hidden format character: a bidirectional
// control, a zero-width character or any other Unicode "Cf" character, or a line or paragraph
// separator. They can make code read differently from how it runs, so the source writes them as
// escapes instead.
//
// Usage: node scripts/check-text.ts
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export interface HiddenCharacter {
  line: number
  column: number
  codePoint: string
}

const HIDDEN = /[\p{Cf}\p{Zl}\p{Zp}]/gu

/** Every hidden format character in `text`, with its 1-based line and column. */
export function findHiddenCharacters(text: string): HiddenCharacter[] {
  return text.split('\n').flatMap((line, index) =>
    [...line.matchAll(HIDDEN)].map((match) => ({
      line: index + 1,
      column: match.index + 1,
      codePoint: `U+${(match[0].codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`,
    })),
  )
}

/** The repository's files, tracked or new, without the ignored ones. */
function repositoryFiles(): string[] {
  const output = execFileSync('git', [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
  ])
  return output.toString('utf8').split('\0').filter(Boolean)
}

function readIfPresent(file: string): Buffer | null {
  try {
    return readFileSync(file)
  } catch (error) {
    // A tracked file deleted from the working tree has nothing to check.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

if (import.meta.main) {
  const files = repositoryFiles()
  let found = 0
  for (const file of files) {
    const bytes = readIfPresent(file)
    // A NUL byte means a binary file, such as an image.
    if (bytes === null || bytes.includes(0)) continue
    for (const { line, column, codePoint } of findHiddenCharacters(bytes.toString('utf8'))) {
      console.error(`${file}:${line}:${column}: hidden character ${codePoint}`)
      found += 1
    }
  }
  if (found > 0) {
    const characters = found === 1 ? 'character' : 'characters'
    console.error(`Found ${found} hidden ${characters}. Write them as escapes, such as \\u202e.`)
    process.exitCode = 1
  } else {
    console.log(`No hidden characters in ${files.length} files.`)
  }
}
