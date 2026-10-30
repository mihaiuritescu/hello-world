import { readFileSync } from 'node:fs'
import { CompiledQuery, Kysely, MysqlDialect, type Generated } from 'kysely'
import { createPool } from 'mysql2'
import type { DbConfig } from '../config.ts'

export interface RoomsTable {
  id: Generated<number>
  lat: number
  lng: number
  created_at: Generated<Date>
}

export interface MessagesTable {
  id: Generated<number>
  room_id: number
  client_id: string
  author_name: string
  body: string
  created_at: Generated<Date>
}

export interface Database {
  rooms: RoomsTable
  messages: MessagesTable
}

// Every connection runs in UTC with MySQL 8.4's strict defaults, whatever the server's own
// settings are. Without strict mode, MySQL truncates over-long values instead of rejecting them.
const SESSION_SETUP =
  "SET SESSION time_zone = '+00:00', SESSION sql_mode = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES," +
  "NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'"

export function createDb(config: DbConfig): Kysely<Database> {
  const pool = createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: 10,
    enableKeepAlive: true,
    // Read and write DATETIME values as UTC, whatever the Node process's time zone.
    timezone: 'Z',
    charset: 'UTF8MB4_0900_AI_CI',
    // BIGINT ids come back as numbers while they are safe integers.
    supportBigNumbers: true,
    bigNumberStrings: false,
    ssl: config.caFile
      ? { ca: readFileSync(config.caFile), rejectUnauthorized: true, verifyIdentity: true }
      : undefined,
  })

  return new Kysely<Database>({
    dialect: new MysqlDialect({
      pool,
      onCreateConnection: async (connection) => {
        await connection.executeQuery(CompiledQuery.raw(SESSION_SETUP))
      },
    }),
  })
}
