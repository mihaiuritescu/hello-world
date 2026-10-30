---
paths:
  - "src/server/**"
  - "src/shared/**"
  - "scripts/**"
---

# Server rules: Node 24, Fastify 5, MySQL 8.4

## TypeScript on Node
- Node runs the `.ts` files directly through type stripping.
  - Use erasable syntax only: no enums, namespaces or parameter properties.
  - Write `import type` for types.
  - Keep the `.ts` extension on relative imports.
- Import shared code through `#shared/…`.

## Routes
- Group routes by feature (`rooms.routes.ts`).
- Validate every body, param and query with the shared zod schemas.
- Errors use the shape `{ statusCode, error, message, code }`.
- Routes use repositories and the `Broadcaster` interface, never Kysely or Socket.IO directly.
- Broadcast only after the write has committed (I1).

## MySQL through Kysely
- Never edit a migration that has run; add a new one instead.
  - One DDL statement per migration, because MySQL DDL commits implicitly.
  - Register every new migration in `db/migrations/index.ts`.
- Check `err.errno` explicitly:
  - 1062 is a duplicate key, so return the stored row (I3);
  - 1452 is a missing parent row, so return 404.
- Never use `INSERT IGNORE`: it hides those errors.
- Times are UTC `DATETIME(3)`. The API returns them as ISO-8601 strings ending in `Z`.
- Session settings such as `FOREIGN_KEY_CHECKS` must run on one pinned connection: `db.connection().execute(...)`.
- Don't call mysql2's `execute()` directly: `LIMIT ?` fails under prepared statements. Use Kysely.

## Logging and shutdown
- **Logging:** log through `request.log` or `app.log`. Never log message bodies, author names or secrets.
- **Shutdown:** handled by `close-with-grace` in `main.ts`. Socket.IO closes its transports in `preClose`, without a disconnect packet, so clients reconnect (I6).
