import { z } from 'zod'
import { LIMITS } from './domain.ts'
import { textProblem } from './text.ts'

/** A point on the map. Clients send wrapped longitudes, so both ranges are strict. */
export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})
export type Coordinates = z.infer<typeof CoordinatesSchema>

/**
 * The `:roomId` route parameter: a positive integer that fits in a JavaScript number, written
 * plainly. Forms such as `0x1`, `1e0` or `01` would give one room several URLs.
 */
export const RoomIdParamsSchema = z.object({
  roomId: z
    .string()
    .regex(/^[1-9]\d*$/, 'Expected a positive whole number')
    .transform(Number)
    .pipe(z.number().max(Number.MAX_SAFE_INTEGER)),
})

/**
 * Trimmed text that everyone in the room will see. Lengths count UTF-16 code units, as
 * JavaScript and `maxlength` do. That is never fewer than the characters MySQL counts, so a
 * valid text always fits its column.
 */
function postedText(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .check((context) => {
      const problem = textProblem(context.value)
      if (problem) context.issues.push({ code: 'custom', message: problem, input: context.value })
    })
}

/**
 * A new message, as the composer sends it. `clientId` is the sender's idempotency key: a send
 * that repeats it gets the stored message back instead of creating another (I3).
 */
export const MessageDraftSchema = z.object({
  clientId: z.uuid(),
  authorName: postedText(LIMITS.authorName),
  body: postedText(LIMITS.messageBody),
})
export type MessageDraft = z.infer<typeof MessageDraftSchema>
