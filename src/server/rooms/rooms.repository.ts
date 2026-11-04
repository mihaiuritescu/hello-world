import type { Room } from '#shared/domain.ts'
import type { Coordinates } from '#shared/schemas.ts'
import type { Kysely, Selectable, Transaction } from 'kysely'
import { toSafeInteger, type Database, type RoomsTable } from '../db/database.ts'
import { isOwnerHash } from './rooms.ownership.ts'

/** Why a change to a room was refused: no such room, or a request without the owner's token. */
type Refusal = { outcome: 'room-not-found' } | { outcome: 'not-owner' }

export type RenameRoomResult = { outcome: 'renamed'; room: Room } | Refusal

export type DeleteRoomResult = { outcome: 'deleted' } | { outcome: 'has-messages' } | Refusal

export interface RoomsRepository {
  /** The newest `limit` rooms, oldest first. */
  listRecent(limit: number): Promise<Room[]>
  findById(id: number): Promise<Room | undefined>
  /** Saves a new room, owned by whoever holds the token that `ownerTokenHash` hashes. */
  create(coordinates: Coordinates, ownerTokenHash: Buffer): Promise<Room>
  /**
   * Names a room, or brings back its default name for null, when `ownerTokenHash` is its
   * owner's. Every rename gets the next revision, even concurrent ones.
   */
  rename(id: number, name: string | null, ownerTokenHash: Buffer | null): Promise<RenameRoomResult>
  /**
   * Deletes a room when `ownerTokenHash` is its owner's and it has no messages, even while a
   * message is on its way (I8).
   */
  deleteIfEmpty(id: number, ownerTokenHash: Buffer | null): Promise<DeleteRoomResult>
}

/** The columns the API shows. The owner token's hash never leaves the database layer. */
const ROOM_COLUMNS = ['id', 'lat', 'lng', 'name', 'revision', 'created_at'] as const

type RoomRow = Pick<Selectable<RoomsTable>, (typeof ROOM_COLUMNS)[number]>

export function createRoomsRepository(db: Kysely<Database>): RoomsRepository {
  return {
    async listRecent(limit) {
      const rows = await db
        .selectFrom('rooms')
        .select(ROOM_COLUMNS)
        .orderBy('id', 'desc')
        .limit(limit)
        .execute()
      return rows.reverse().map(toRoom)
    },

    async findById(id) {
      const row = await db
        .selectFrom('rooms')
        .select(ROOM_COLUMNS)
        .where('id', '=', id)
        .executeTakeFirst()
      return row && toRoom(row)
    },

    async create({ lat, lng }, ownerTokenHash) {
      const { insertId } = await db
        .insertInto('rooms')
        .values({ lat, lng, owner_token_hash: ownerTokenHash })
        .executeTakeFirstOrThrow()
      const row = await db
        .selectFrom('rooms')
        .select(ROOM_COLUMNS)
        .where('id', '=', toSafeInteger(insertId))
        .executeTakeFirstOrThrow()
      return toRoom(row)
    },

    rename(id, name, ownerTokenHash) {
      return db.transaction().execute(async (trx): Promise<RenameRoomResult> => {
        // The row lock makes concurrent renames take turns, so each reads back its own revision.
        const refusal = await lockAsOwner(trx, id, ownerTokenHash)
        if (refusal) return refusal

        await trx
          .updateTable('rooms')
          .set((eb) => ({ name, revision: eb('revision', '+', 1) }))
          .where('id', '=', id)
          .execute()
        const row = await trx
          .selectFrom('rooms')
          .select(ROOM_COLUMNS)
          .where('id', '=', id)
          .executeTakeFirstOrThrow()
        return { outcome: 'renamed', room: toRoom(row) }
      })
    },

    deleteIfEmpty(id, ownerTokenHash) {
      return db.transaction().execute(async (trx): Promise<DeleteRoomResult> => {
        const refusal = await lockAsOwner(trx, id, ownerTokenHash)
        if (refusal) return refusal

        // The foreign key's ON DELETE CASCADE would take a room's messages with it, so the room
        // must be empty, even of a message being stored right now. Storing one locks its room for
        // the foreign-key check, which waits for the lock this transaction holds. A message stored
        // before shows in this locking read. One stored after finds no room, and gets a 404 (I8).
        const message = await trx
          .selectFrom('messages')
          .select('id')
          .where('room_id', '=', id)
          .limit(1)
          .forShare()
          .executeTakeFirst()
        if (message) return { outcome: 'has-messages' }

        await trx.deleteFrom('rooms').where('id', '=', id).execute()
        return { outcome: 'deleted' }
      })
    },
  }
}

/**
 * Locks a room's row until the transaction ends, then checks that the request holds the room's
 * owner token. Returns why the change can't go ahead, or null when it can.
 */
async function lockAsOwner(
  trx: Transaction<Database>,
  id: number,
  ownerTokenHash: Buffer | null,
): Promise<Refusal | null> {
  const row = await trx
    .selectFrom('rooms')
    .select('owner_token_hash')
    .where('id', '=', id)
    .forUpdate()
    .executeTakeFirst()
  if (!row) return { outcome: 'room-not-found' }
  return isOwnerHash(row.owner_token_hash, ownerTokenHash) ? null : { outcome: 'not-owner' }
}

function toRoom(row: RoomRow): Room {
  return {
    id: toSafeInteger(row.id),
    lat: row.lat,
    lng: row.lng,
    name: row.name,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
  }
}
