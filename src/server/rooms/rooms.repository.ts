import type { Room } from '#shared/domain.ts'
import type { Coordinates } from '#shared/schemas.ts'
import type { Kysely, Selectable } from 'kysely'
import { toSafeInteger, type Database, type RoomsTable } from '../db/database.ts'
import { isOwnerHash } from './rooms.ownership.ts'

export type RenameRoomResult =
  { outcome: 'renamed'; room: Room } | { outcome: 'room-not-found' } | { outcome: 'not-owner' }

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
        const owner = await trx
          .selectFrom('rooms')
          .select('owner_token_hash')
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst()
        if (!owner) return { outcome: 'room-not-found' }
        if (!isOwnerHash(owner.owner_token_hash, ownerTokenHash)) return { outcome: 'not-owner' }

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
  }
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
