import { LIMITS, type CreatedRoom } from '#shared/domain.ts'
import { CoordinatesSchema, RoomIdParamsSchema, RoomRenameSchema } from '#shared/schemas.ts'
import type { FastifyInstance } from 'fastify'
import { notRoomOwner, parseInput, roomNotFound } from '../errors.ts'
import type { Broadcaster } from '../realtime/broadcaster.ts'
import { issueOwnerToken, ownerTokenHash } from './rooms.ownership.ts'
import type { RoomsRepository } from './rooms.repository.ts'

interface RoomRoutesDeps {
  rooms: RoomsRepository
  broadcaster: Broadcaster
  /** Room creations, and renames, one client may make a minute: each counted on its own. */
  writesPerMinute: number
}

export function registerRoomRoutes(
  app: FastifyInstance,
  { rooms, broadcaster, writesPerMinute }: RoomRoutesDeps,
) {
  app.get('/api/rooms', async () => ({ rooms: await rooms.listRecent(LIMITS.listedRooms) }))

  // One room, for links to rooms older than the ones the list returns.
  app.get('/api/rooms/:roomId', async (request) => {
    const { roomId } = parseInput(RoomIdParamsSchema, request.params)
    const room = await rooms.findById(roomId)
    if (!room) throw roomNotFound(roomId)
    return room
  })

  // Every new or renamed room reaches every connected client, so these writes have a lower
  // limit. Each route counts its own requests against it.
  const rateLimit = { max: writesPerMinute, timeWindow: '1 minute' }

  app.post('/api/rooms', { config: { rateLimit } }, async (request, reply) => {
    const coordinates = parseInput(CoordinatesSchema, request.body)
    const { token, hash } = issueOwnerToken()
    const room = await rooms.create(coordinates, hash)
    // The insert has committed (autocommit), so other clients may hear about it now (I1). They
    // hear of the room alone: the owner token goes only to its creator, in this response.
    broadcaster.roomCreated(room)
    const created: CreatedRoom = { ...room, ownerToken: token }
    return reply.code(201).send(created)
  })

  app.patch('/api/rooms/:roomId', { config: { rateLimit } }, async (request) => {
    const { roomId } = parseInput(RoomIdParamsSchema, request.params)
    const { name } = parseInput(RoomRenameSchema, request.body)
    const result = await rooms.rename(roomId, name, ownerTokenHash(request.headers.authorization))
    if (result.outcome === 'room-not-found') throw roomNotFound(roomId)
    if (result.outcome === 'not-owner') throw notRoomOwner(roomId)
    // The rename's transaction has committed (I1).
    broadcaster.roomUpdated(result.room)
    return result.room
  })
}
