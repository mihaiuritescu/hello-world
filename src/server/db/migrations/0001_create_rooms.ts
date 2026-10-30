import { sql, type Kysely } from 'kysely'

// The auto-increment id doubles as the public room number ("Chatroom 7"): unique and
// increasing, though not gapless.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE rooms (
      id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      lat        DOUBLE          NOT NULL,
      lng        DOUBLE          NOT NULL,
      created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      CONSTRAINT rooms_lat_chk CHECK (lat BETWEEN -90 AND 90),
      CONSTRAINT rooms_lng_chk CHECK (lng BETWEEN -180 AND 180)
    ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  `.execute(db)
}
