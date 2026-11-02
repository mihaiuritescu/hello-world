import { LIMITS } from '#shared/domain.ts'
import { CoordinatesSchema, RoomIdParamsSchema } from '#shared/schemas.ts'
import type { FastifyInstance } from 'fastify'
import { parseInput, roomNotFound } from '../errors.ts'
import type { Broadcaster } from '../realtime/broadcaster.ts'
import type { RoomsRepository } from './rooms.repository.ts'

interface RoomRoutesDeps {
  rooms: RoomsRepository
  broadcaster: Broadcaster
  /** Room creations one client may make a minute. */
  createsPerMinute: number
}

export function registerRoomRoutes(
  app: FastifyInstance,
  { rooms, broadcaster, createsPerMinute }: RoomRoutesDeps,
) {
  app.get('/api/rooms', async () => ({ rooms: await rooms.listRecent(LIMITS.listedRooms) }))

  // One room, for links to rooms older than the ones the list returns.
  app.get('/api/rooms/:roomId', async (request) => {
    const { roomId } = parseInput(RoomIdParamsSchema, request.params)
    const room = await rooms.findById(roomId)
    if (!room) throw roomNotFound(roomId)
    return room
  })

  // Every new room reaches every connected client, so creating them has a lower limit.
  const rateLimit = { max: createsPerMinute, timeWindow: '1 minute' }
  app.post('/api/rooms', { config: { rateLimit } }, async (request, reply) => {
    const coordinates = parseInput(CoordinatesSchema, request.body)
    const room = await rooms.create(coordinates)
    // The insert has committed (autocommit), so other clients may hear about it now (I1).
    broadcaster.roomCreated(room)
    return reply.code(201).send(room)
  })
}
