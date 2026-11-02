import type { Message } from '#shared/domain.ts'
import type { MessageDraft } from '#shared/schemas.ts'
import type { Kysely, Selectable } from 'kysely'
import {
  hasErrno,
  MysqlErrno,
  toSafeInteger,
  type Database,
  type MessagesTable,
} from '../db/database.ts'

export interface NewMessage extends MessageDraft {
  roomId: number
}

export type CreateMessageResult =
  { outcome: 'created' | 'replayed'; message: Message } | { outcome: 'room-not-found' }

export interface MessagesRepository {
  /** The room's newest `limit` messages, oldest first. */
  listLatest(roomId: number, limit: number): Promise<Message[]>
  /**
   * Saves a message once. When its clientId repeats in the same room, the message stored the
   * first time comes back as `replayed`, whatever the repeat says (I3).
   */
  create(message: NewMessage): Promise<CreateMessageResult>
}

export function createMessagesRepository(db: Kysely<Database>): MessagesRepository {
  return {
    async listLatest(roomId, limit) {
      const rows = await db
        .selectFrom('messages')
        .selectAll()
        .where('room_id', '=', roomId)
        .orderBy('id', 'desc')
        .limit(limit)
        .execute()
      return rows.reverse().map(toMessage)
    },

    async create({ roomId, clientId, authorName, body }) {
      let insertId: bigint | undefined
      try {
        const result = await db
          .insertInto('messages')
          .values({ room_id: roomId, client_id: clientId, author_name: authorName, body })
          .executeTakeFirstOrThrow()
        insertId = result.insertId
      } catch (error) {
        if (hasErrno(error, MysqlErrno.missingParent)) return { outcome: 'room-not-found' }
        if (!hasErrno(error, MysqlErrno.duplicateKey)) throw error
        // The same send arrived before: answer with what was stored then.
        const stored = await db
          .selectFrom('messages')
          .selectAll()
          .where('room_id', '=', roomId)
          .where('client_id', '=', clientId)
          .executeTakeFirstOrThrow()
        return { outcome: 'replayed', message: toMessage(stored) }
      }

      const created = await db
        .selectFrom('messages')
        .selectAll()
        .where('id', '=', toSafeInteger(insertId))
        .executeTakeFirstOrThrow()
      return { outcome: 'created', message: toMessage(created) }
    },
  }
}

/** The API's view of a row. The clientId stays on the server. */
function toMessage(row: Selectable<MessagesTable>): Message {
  return {
    id: toSafeInteger(row.id),
    roomId: toSafeInteger(row.room_id),
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  }
}
