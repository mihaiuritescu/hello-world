import type { Migration } from 'kysely/migration'
import * as createRooms from './0001_create_rooms.ts'
import * as createMessages from './0002_create_messages.ts'

// An explicit list keeps the order obvious and avoids scanning a folder at runtime.
// MySQL DDL commits implicitly, so each migration holds exactly one DDL statement.
export const migrations: Record<string, Migration> = {
  '0001_create_rooms': createRooms,
  '0002_create_messages': createMessages,
}
