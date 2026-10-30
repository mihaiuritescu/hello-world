import { sql, type Kysely } from 'kysely'

// client_id is the sender's idempotency key: a retried POST finds the stored row instead of
// creating a second one. VARCHAR limits count characters, and strict mode rejects longer values.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE messages (
      id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      room_id     BIGINT UNSIGNED NOT NULL,
      client_id   CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      author_name VARCHAR(40)     NOT NULL,
      body        VARCHAR(1000)   NOT NULL,
      created_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY messages_room_client_uq (room_id, client_id),
      KEY messages_room_latest_idx (room_id, id),
      CONSTRAINT messages_room_fk FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE,
      CONSTRAINT messages_author_name_chk CHECK (CHAR_LENGTH(author_name) >= 1),
      CONSTRAINT messages_body_chk CHECK (CHAR_LENGTH(body) >= 1)
    ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  `.execute(db)
}
