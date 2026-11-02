import { LIMITS } from '#shared/domain.ts'
import { MessageDraftSchema, RoomIdParamsSchema } from '#shared/schemas.ts'
import type { FastifyInstance } from 'fastify'
import { parseInput, roomNotFound } from '../errors.ts'
import type { Broadcaster } from '../realtime/broadcaster.ts'
import type { RoomsRepository } from '../rooms/rooms.repository.ts'
import type { MessagesRepository } from './messages.repository.ts'

interface MessageRoutesDeps {
  rooms: RoomsRepository
  messages: MessagesRepository
  broadcaster: Broadcaster
}

export function registerMessageRoutes(
  app: FastifyInstance,
  { rooms, messages, broadcaster }: MessageRoutesDeps,
) {
  app.get('/api/rooms/:roomId/messages', async (request) => {
    const { roomId } = parseInput(RoomIdParamsSchema, request.params)
    if (!(await rooms.findById(roomId))) throw roomNotFound(roomId)
    return { messages: await messages.listLatest(roomId, LIMITS.loadedMessages) }
  })

  app.post('/api/rooms/:roomId/messages', async (request, reply) => {
    const { roomId } = parseInput(RoomIdParamsSchema, request.params)
    const draft = parseInput(MessageDraftSchema, request.body)
    const result = await messages.create({ roomId, ...draft })
    if (result.outcome === 'room-not-found') throw roomNotFound(roomId)
    // The insert has committed (autocommit), so other clients may hear about it now (I1). A
    // replay announces it again, in case the first announcement was lost; clients drop
    // duplicates by id (I4).
    broadcaster.messageCreated(result.message)
    return reply.code(result.outcome === 'created' ? 201 : 200).send(result.message)
  })
}
