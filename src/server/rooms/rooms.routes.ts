import { LIMITS } from '#shared/domain.ts'
import { CoordinatesSchema, RoomIdParamsSchema } from '#shared/schemas.ts'
import type { FastifyInstance } from 'fastify'
import { HttpError, parseInput } from '../errors.ts'
import type { Broadcaster } from '../realtime/broadcaster.ts'
import type { RoomsRepository } from './rooms.repository.ts'

interface RoomRoutesDeps {
  rooms: RoomsRepository
  broadcaster: Broadcaster
}

export function registerRoomRoutes(app: FastifyInstance, { rooms, broadcaster }: RoomRoutesDeps) {
  app.get('/api/rooms', async () => ({ rooms: await rooms.listRecent(LIMITS.listedRooms) }))

  // One room, for links to rooms older than the ones the list returns.
  app.get('/api/rooms/:roomId', async (request) => {
    const { roomId } = parseInput(RoomIdParamsSchema, request.params)
    const room = await rooms.findById(roomId)
    if (!room) throw new HttpError(404, 'ROOM_NOT_FOUND', `Room ${roomId} does not exist.`)
    return room
  })

  app.post('/api/rooms', async (request, reply) => {
    const coordinates = parseInput(CoordinatesSchema, request.body)
    const room = await rooms.create(coordinates)
    // The insert has committed (autocommit), so other clients may hear about it now (I1).
    broadcaster.roomCreated(room)
    return reply.code(201).send(room)
  })
}
