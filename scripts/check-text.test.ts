import { describe, expect, it } from 'vitest'
import { checkFile, findHiddenCharacters } from './check-text.ts'

// Built from code points, so this file holds none of the characters it looks for.
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e)
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b)
const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff)
const LINE_SEPARATOR = String.fromCodePoint(0x2028)
const E_ACUTE = String.fromCodePoint(0xe9)
const PARTY_POPPER = String.fromCodePoint(0x1f389)
const HANGUL_FILLER = String.fromCodePoint(0x3164)
const VARIATION_SELECTOR_17 = String.fromCodePoint(0xe0100)
const NUL = String.fromCodePoint(0)
const ESCAPE = String.fromCodePoint(0x1b)

describe('findHiddenCharacters', () => {
  it('finds nothing in ordinary text, accented letters and emoji included', () => {
    expect(findHiddenCharacters(`const caf${E_ACUTE} = "${PARTY_POPPER}"\n`)).toEqual([])
  })

  it('reports a bidirectional control with its line, column and code point', () => {
    const text = `const ok = 1\nconst x = "${RIGHT_TO_LEFT_OVERRIDE}"\n`

    expect(findHiddenCharacters(text)).toEqual([{ line: 2, column: 12, codePoint: 'U+202E' }])
  })

  it('reports letters and variation selectors that render as nothing', () => {
    const text = `const ${HANGUL_FILLER} = 1 // ${VARIATION_SELECTOR_17}`

    expect(findHiddenCharacters(text)).toEqual([
      { line: 1, column: 7, codePoint: 'U+3164' },
      { line: 1, column: 16, codePoint: 'U+E0100' },
    ])
  })

  it('reports control characters, NUL among them, but not tabs or carriage returns', () => {
    expect(findHiddenCharacters(`a${NUL}b\tc${ESCAPE}[0m\r`)).toEqual([
      { line: 1, column: 2, codePoint: 'U+0000' },
      { line: 1, column: 6, codePoint: 'U+001B' },
    ])
  })

  it('reports a carriage return inside a line, which ends it in JavaScript, but not a CRLF', () => {
    const text = 'deleteAll() //\r// TODO: tidy up\nok\r\n'

    expect(findHiddenCharacters(text)).toEqual([{ line: 1, column: 15, codePoint: 'U+000D' }])
  })

  it('reports zero-width characters, byte-order marks and line separators', () => {
    const text = `${BYTE_ORDER_MARK}a${ZERO_WIDTH_SPACE}b\nc${LINE_SEPARATOR}d`

    expect(findHiddenCharacters(text)).toEqual([
      { line: 1, column: 1, codePoint: 'U+FEFF' },
      { line: 1, column: 3, codePoint: 'U+200B' },
      { line: 2, column: 2, codePoint: 'U+2028' },
    ])
  })
})

describe('checkFile', () => {
  it('checks a text file even when it holds a NUL byte', () => {
    const bytes = Buffer.from(`a${NUL}b${RIGHT_TO_LEFT_OVERRIDE}`)

    expect(checkFile('notes.md', bytes).map((found) => found.codePoint)).toEqual([
      'U+0000',
      'U+202E',
    ])
  })

  it('skips the binary files that .gitattributes marks, such as images', () => {
    expect(checkFile('logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1b]))).toEqual([])
  })
})
