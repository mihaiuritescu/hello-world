// Fails when a text file in the repository holds a character that doesn't show: a bidirectional
// control, a zero-width character or any other Unicode "Cf" character, a control character
// (tabs and carriage returns aside), a line or paragraph separator, or a code point that renders
// as nothing, such as U+3164 HANGUL FILLER or a variation selector. They can make code read
// differently from how it runs, so the source writes them as escapes instead.
//
// Usage: node scripts/check-text.ts
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export interface HiddenCharacter {
  line: number
  column: number
  codePoint: string
}

const HIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/gu
/** Control characters that are ordinary in text: tabs, and the carriage returns of CRLF. */
const ORDINARY = new Set(['\t', '\r'])
/** Files skipped as binary, by extension: the ones .gitattributes marks, and their kin. */
const BINARY = /\.(png|jpe?g|gif|ico|webp|avif|pdf|woff2?|ttf|otf|zip|gz)$/i

/** Every hidden character in `text`, with its 1-based line and column. */
export function findHiddenCharacters(text: string): HiddenCharacter[] {
  return text.split('\n').flatMap((line, index) =>
    [...line.matchAll(HIDDEN)]
      .filter((match) => !ORDINARY.has(match[0]))
      .map((match) => ({
        line: index + 1,
        column: match.index + 1,
        codePoint: `U+${(match[0].codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`,
      })),
  )
}

/**
 * The hidden characters in one file. Binary files are known by their extension, never by a NUL
 * byte: a NUL in a text file is one more character to report, not a reason to skip the file.
 */
export function checkFile(path: string, bytes: Buffer): HiddenCharacter[] {
  return BINARY.test(path) ? [] : findHiddenCharacters(bytes.toString('utf8'))
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
    if (bytes === null) continue
    for (const { line, column, codePoint } of checkFile(file, bytes)) {
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
