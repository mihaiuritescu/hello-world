import { describe, expect, it } from 'vitest'
import { textProblem } from './text.ts'

describe('textProblem', () => {
  it.each([
    ['plain text', 'Hello, world'],
    ['a tab', 'col 1\tcol 2'],
    ['letters with two combining accents', 'Tie\u0302\u0301ng Vie\u0323\u0302t'],
    ['an emoji family joined with zero-width joiners', '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'],
    ['an emoji with a variation selector', '\u2764\uFE0F'],
    ['a keycap emoji', '1\uFE0F\u20E3'],
  ])('accepts %s', (_case, text) => {
    expect(textProblem(text)).toBeNull()
  })

  it.each([
    ['only white space', '   ', 'Write at least one visible character.'],
    ['only a zero-width space', '\u200B', 'Write at least one visible character.'],
    ['only a Hangul filler', '\u3164', 'Write at least one visible character.'],
    ['only a blank Braille pattern', '\u2800', 'Write at least one visible character.'],
    ['a line break', 'line 1\nline 2', "Line breaks and control characters aren't allowed."],
    ['a line separator', 'one\u2028two', "Line breaks and control characters aren't allowed."],
    ['a paragraph separator', 'one\u2029two', "Line breaks and control characters aren't allowed."],
    ['a control character', 'beep\u0007', "Line breaks and control characters aren't allowed."],
    ['a right-to-left override', '\u202Eecila', "Text direction controls aren't allowed."],
    [
      'five accents on one letter',
      'a\u0301\u0301\u0301\u0301\u0301',
      'Too many accents on one letter.',
    ],
  ])('rejects %s', (_case, text, problem) => {
    expect(textProblem(text)).toBe(problem)
  })
})
