import { z } from 'zod'

/** A point on the map. Clients send wrapped longitudes, so both ranges are strict. */
export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})
export type Coordinates = z.infer<typeof CoordinatesSchema>

/** The `:roomId` route parameter: a positive integer that fits in a JavaScript number. */
export const RoomIdParamsSchema = z.object({
  roomId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
})
