import { describe, expect, it } from 'vitest'
import { findHiddenCharacters } from './check-text.ts'

// Built from code points, so this file holds none of the characters it looks for.
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e)
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b)
const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff)
const LINE_SEPARATOR = String.fromCodePoint(0x2028)
const E_ACUTE = String.fromCodePoint(0xe9)
const PARTY_POPPER = String.fromCodePoint(0x1f389)

describe('findHiddenCharacters', () => {
  it('finds nothing in ordinary text, accented letters and emoji included', () => {
    expect(findHiddenCharacters(`const caf${E_ACUTE} = "${PARTY_POPPER}"\n`)).toEqual([])
  })

  it('reports a bidirectional control with its line, column and code point', () => {
    const text = `const ok = 1\nconst x = "${RIGHT_TO_LEFT_OVERRIDE}"\n`

    expect(findHiddenCharacters(text)).toEqual([{ line: 2, column: 12, codePoint: 'U+202E' }])
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
