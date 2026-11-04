# Hello World

A real-time chat on a world map: click anywhere to drop a pin, open its chatroom, and talk to whoever else is there. Built for the Wolfpack Digital full-stack test.

**Live demo:** <https://3-125-55-249.nip.io>. Open it in two windows to watch pins and messages arrive live.

> **Status:** rooms, messages and live updates work, everything persists, and each client has rate limits. The demo runs on AWS; the self-review comes next. See the [PRD](docs/PRD.md) for the plan.

## Using it

- **Create a chatroom:** click anywhere on the map, or focus the map and press Enter to create one at its centre.
- **Open a room:** click its pin, or focus the pin and press Enter. The open room's pin turns red, and the panel shows the room's latest 100 messages.
- **Post a message:** write your name and a message, then press Submit or Enter. The message field clears for the next one, and your name is remembered on this device.
- **Send again safely:** if a send fails, your draft stays in the field. Sending it again never posts it twice.
- **Live updates:** open the app in two windows. New pins, and new messages in the room you have open, show up in both within a second. The chip next to the room title says **Live**, or **Reconnecting…** while the app catches up; without a live connection, it refreshes every 10 seconds.
- **Share a room:** the open room is part of the URL (`?room=3`), so a link or a reload reopens it.

## Quick start (only Docker needed)

You need [Docker](https://docs.docker.com/get-docker/) with Compose v2. Docker Desktop works, and so do the free [Rancher Desktop](https://rancherdesktop.io/) and [Podman Desktop](https://podman-desktop.io/).

```bash
docker compose up --build
```

Open <http://localhost:3000>. The first start takes about a minute, because MySQL initialises its data directory.

- **Stop and keep the data:** `docker compose down`.
- **Stop and wipe the data:** `docker compose down -v`.

## Developer setup

**You need:**
- Node.js 24 LTS (24.15 or later);
- pnpm 11;
- Docker, to run MySQL.

```bash
corepack enable          # or: npm install -g pnpm@11.28.9
pnpm install
pnpm dev
```

`pnpm dev` starts MySQL in Docker and applies the migrations. It then runs the API on port 3000 and the Vite dev server on port 5173, which proxies API and WebSocket traffic to the API. Open <http://localhost:5173>.

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | MySQL, migrations, API and web dev server, with reload on change |
| `pnpm build` then `pnpm start` | Build the SPA and serve everything from the API on port 3000 |
| `pnpm db:up` / `pnpm db:migrate` | Start MySQL in Docker / apply pending migrations |
| `pnpm verify` | MySQL, then lint, format check, type-check, licence check, hidden-character check, unit and integration tests |
| `pnpm test` | Unit and integration tests (MySQL must be running: `pnpm db:up`) |
| `pnpm test:e2e` | Playwright end-to-end tests against the production build |
| `pnpm format` | Format the code with Prettier |

Before the first end-to-end run, install the browsers with `pnpm exec playwright install chromium webkit`.

### Configuration

Every setting has a working default for local runs, so no `.env` file is needed. To change one, copy [`.env.example`](.env.example) to `.env` and uncomment the setting. Docker Compose also reads `PORT` and `DB_PORT` from `.env` as the host ports it publishes.

## Testing

| Level | Tools | What it proves |
|---|---|---|
| Unit | Vitest, jsdom, Vue Test Utils | Stores (duplicates dropped, order by id, retries reusing one `clientId`), schemas, helpers and components |
| Integration | Vitest against MySQL | Every route through `app.inject()`, rate limits, migrations, and Socket.IO delivery and caps on a real port |
| End-to-end | Playwright: Chromium for all tests, WebKit for the `@smoke` ones | FR-1 to FR-6 in a real browser, two windows for real time, and axe WCAG 2.2 AA scans of the start screen, an open room, a long chat, and the room list and messages failing to load |

- `pnpm test` runs the unit and integration tests, with MySQL running (`pnpm db:up`).
- `pnpm test:e2e` runs the end-to-end tests against the production build, on their own database, with the map tiles stubbed.
- Integration tests reset the tables between tests, and no test sleeps: each waits for an event, a response or the page.

## Architecture

```
browser ──HTTP──► Fastify: the built SPA and the REST API ──► MySQL 8.4
        ◄──WS───  Socket.IO: room:created, message:created
```

- **One process, one origin.** One Node process serves the SPA, the REST API and the WebSocket, so there's no CORS, and one image runs everywhere.
- **Writes go over REST.** Only after the database commit does the server announce them over Socket.IO, to everyone or to the room's channel.
- **One data path on the client.** Pinia stores hold all server data. HTTP responses and socket events go through the same upsert, which drops duplicates and orders by id.
- **Subscribe, then read.** Opening a room subscribes, then loads its messages; a reconnect does both again. Without a socket, the client polls every 10 seconds.

The [PRD](docs/PRD.md) has the decisions and the invariants behind them.

## Troubleshooting

| Problem | Fix |
|---|---|
| A port is already in use | Set `PORT` (app, default 3000) or `DB_PORT` (MySQL, default 3307) in `.env`. The Vite dev server always uses 5173 |
| `Cannot reach MySQL` | Start Docker, then run `pnpm db:up` |
| `corepack enable` fails with `EPERM` on Windows | Run it once from an Administrator terminal, or install pnpm with `npm install -g pnpm@11.28.9` |
| Tests fail on a missing `hello_world_test` database | The test databases are created when MySQL first initialises. Run `docker compose down -v`, then `pnpm db:up` |
| "You're creating chatrooms too fast" or "sending messages too fast" | A rate limit: wait a minute. For local load tests, raise the limits in `.env` (see `.env.example`) |

## Deployment

The [live demo](https://3-125-55-249.nip.io) runs on AWS: one EC2 instance behind Caddy and Let's Encrypt, with RDS for MySQL, from a single CloudFormation stack. Its address comes from nip.io, which resolves a name like `3-125-55-249.nip.io` to the IP address it spells, so the demo needs no domain. Pushing a version tag such as `v1.0.0` deploys it: CI tests the commit, publishes the image and deploys it, with no AWS keys stored in GitHub. [The runbook](infra/aws/RUNBOOK.md) gives every step, from the first check to the teardown, and [Infrastructure and costs](docs/INFRASTRUCTURE.md) covers the architecture and the monthly cost of staging and production.

## Documentation

- [Technical PRD](docs/PRD.md): requirements and up-front technical decisions.
- [Infrastructure and costs](docs/INFRASTRUCTURE.md): how the app runs on AWS, and what staging and production cost.
- [AWS runbook](infra/aws/RUNBOOK.md): every step to deploy, check and tear down the demo.
- [AI setup](docs/AI-SETUP.md): how AI coding tools were used, and how to reproduce it. [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) hold the rules they follow.
- [Self-review](docs/review/README.md): the review configuration and its results, with [REVIEW.md](REVIEW.md) as the guide.

## Beyond the brief

- **Real time,** the brief's optional part: other windows see new pins and messages within a second, and catch up after a lost connection. A chip shows whether the connection is live.
- **Duplicate-safe sending:** sending a failed message again never stores it twice.
- **Deep links** (`?room=3`) and a remembered name.
- **Keyboard access:** Enter on the focused map creates a room, and Enter on a pin opens it. axe scans the main screens and the load errors in CI.
- **Loading, empty and error states,** with Retry.
- **Rate limits per client,** on the API and on the WebSockets.
- **[A live AWS demo](https://3-125-55-249.nip.io),** with HTTPS, from one CloudFormation stack, deployed by pushing a version tag, and a cost estimate for staging and production.
- **A multi-agent self-review,** with its report and triage.

## Limitations

- **Anyone can post under any name:** there are no accounts, by design for v1.
- **No moderation:** rate and length limits are the only protection against spam.
- **Rate limits count by IP address,** so people behind one address share them.
- **One server instance.** The way to scale out, with a load balancer and a shared Socket.IO adapter, is in [Infrastructure and costs](docs/INFRASTRUCTURE.md).
- **Partial history:** a room opens on its latest 100 messages, with no paging back, and the map shows the 1,000 newest rooms.
- **Best-effort map tiles:** OpenStreetMap's public tiles have no service-level guarantee.

## Licence

[MIT](LICENSE). Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
