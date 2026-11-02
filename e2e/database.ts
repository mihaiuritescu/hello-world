import { randomUUID } from 'node:crypto'
import mysql from 'mysql2/promise'

// The database the end-to-end server runs against (see `webServer.env` in playwright.config.ts).
// The other settings default to the local Docker Compose database.
const connectionOptions = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3307),
  user: process.env.DB_USER ?? 'hello_world',
  password: process.env.DB_PASSWORD ?? 'hello_world',
  database: 'hello_world_e2e',
}

/** Inserts `count` rooms at 0°, 0° in a single statement. */
export async function seedRooms(count: number): Promise<void> {
  const connection = await mysql.createConnection(connectionOptions)
  try {
    const rows = Array.from({ length: count }, () => [0, 0])
    await connection.query('INSERT INTO rooms (lat, lng) VALUES ?', [rows])
  } finally {
    await connection.end()
  }
}

/** Inserts `count` messages into a room, "Message 1" to "Message <count>", in one statement. */
export async function seedMessages(roomId: number, count: number): Promise<void> {
  const connection = await mysql.createConnection(connectionOptions)
  try {
    const rows = Array.from({ length: count }, (_, index) => [
      roomId,
      randomUUID(),
      'Seeder',
      `Message ${index + 1}`,
    ])
    await connection.query(
      'INSERT INTO messages (room_id, client_id, author_name, body) VALUES ?',
      [rows],
    )
  } finally {
    await connection.end()
  }
}

/** Empties every table and restarts the ids at 1, so each test sees "Chatroom 1" first. */
export async function resetDatabase(): Promise<void> {
  const connection = await mysql.createConnection(connectionOptions)
  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0')
    await connection.query('TRUNCATE TABLE messages')
    await connection.query('TRUNCATE TABLE rooms')
    await connection.query('SET FOREIGN_KEY_CHECKS = 1')
  } finally {
    await connection.end()
  }
}
