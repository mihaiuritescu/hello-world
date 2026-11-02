// Rules for the names and texts that everyone in a room sees. They stop a single post from
// garbling the room: no blank-looking posts, no reordered text, no message drawn over others.
// This file has no dependencies, so the browser can check a draft without loading zod. Special
// characters are written as escapes, so the source shows exactly which ones are meant.

/** A character that shows: not white space, nor an invisible formatting or filler character. */
const VISIBLE = /[^\p{White_Space}\p{Default_Ignorable_Code_Point}\u2800]/u
/**
 * A control character other than a tab, or Unicode's line or paragraph separator. Line breaks
 * would let one message fill the room.
 */
const CONTROL = /[^\P{Cc}\t]|[\u2028\u2029]/u
/** Bidirectional embeddings, overrides and isolates, which reorder how the nearby text reads. */
const DIRECTION_CONTROL = /[\u202A-\u202E\u2066-\u2069]/u
/**
 * Five or more combining marks in a row. No language needs that many, and they paint over the
 * lines around them.
 */
const STACKED_MARKS = /\p{M}{5,}/u

/** Why `text` can't be posted as a name or a message, or null when it can. */
export function textProblem(text: string): string | null {
  if (!VISIBLE.test(text)) return 'Write at least one visible character.'
  if (CONTROL.test(text)) return "Line breaks and control characters aren't allowed."
  if (DIRECTION_CONTROL.test(text)) return "Text direction controls aren't allowed."
  if (STACKED_MARKS.test(text)) return 'Too many accents on one letter.'
  return null
}
