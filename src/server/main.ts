import closeWithGrace from 'close-with-grace'
import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'
import { createDb } from './db/database.ts'

const config = loadConfig()
const db = createDb(config.db)
const app = await buildApp({ config, db })

// `docker stop` sends SIGTERM: finish in-flight requests, then release database connections.
closeWithGrace({ delay: 10_000 }, async ({ err }) => {
  if (err) app.log.error({ err }, 'shutting down after an unexpected error')
  await app.close()
  await db.destroy()
})

await app.listen({ host: config.host, port: config.port })
