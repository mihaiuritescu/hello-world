import type { Room } from '#shared/domain.ts'
import type { Coordinates } from '#shared/schemas.ts'
import type { Kysely, Selectable } from 'kysely'
import { toSafeInteger, type Database, type RoomsTable } from '../db/database.ts'

export interface RoomsRepository {
  /** The newest `limit` rooms, oldest first. */
  listRecent(limit: number): Promise<Room[]>
  findById(id: number): Promise<Room | undefined>
  create(coordinates: Coordinates): Promise<Room>
}

export function createRoomsRepository(db: Kysely<Database>): RoomsRepository {
  return {
    async listRecent(limit) {
      const rows = await db
        .selectFrom('rooms')
        .selectAll()
        .orderBy('id', 'desc')
        .limit(limit)
        .execute()
      return rows.reverse().map(toRoom)
    },

    async findById(id) {
      const row = await db.selectFrom('rooms').selectAll().where('id', '=', id).executeTakeFirst()
      return row && toRoom(row)
    },

    async create({ lat, lng }) {
      const { insertId } = await db
        .insertInto('rooms')
        .values({ lat, lng })
        .executeTakeFirstOrThrow()
      const row = await db
        .selectFrom('rooms')
        .selectAll()
        .where('id', '=', toSafeInteger(insertId))
        .executeTakeFirstOrThrow()
      return toRoom(row)
    },
  }
}

function toRoom(row: Selectable<RoomsTable>): Room {
  return {
    id: toSafeInteger(row.id),
    lat: row.lat,
    lng: row.lng,
    createdAt: row.created_at.toISOString(),
  }
}
