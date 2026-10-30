# Hello World

A real-time chat on a world map: click anywhere to drop a pin, open its chatroom, and talk to whoever else is there. Built for the Wolfpack Digital full-stack test.

> **Status:** the walking skeleton is ready: the map, the empty chat panel, the server, the database and CI. Rooms, messages and real-time updates come next. See the [PRD](docs/PRD.md) for the plan.

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
| `pnpm verify` | MySQL, then lint, format check, type-check, licence check, unit and integration tests |
| `pnpm test` | Unit and integration tests (MySQL must be running: `pnpm db:up`) |
| `pnpm test:e2e` | Playwright end-to-end tests against the production build |
| `pnpm format` | Format the code with Prettier |

Before the first end-to-end run, install the browsers with `pnpm exec playwright install chromium webkit`.

### Configuration

Every setting has a working default for local runs, so no `.env` file is needed. To change one, copy [`.env.example`](.env.example) to `.env` and uncomment the setting. Docker Compose also reads `PORT` and `DB_PORT` from `.env` as the host ports it publishes.

## Troubleshooting

| Problem | Fix |
|---|---|
| A port is already in use | Set `PORT` (app, default 3000) or `DB_PORT` (MySQL, default 3307) in `.env`. The Vite dev server always uses 5173 |
| `Cannot reach MySQL` | Start Docker, then run `pnpm db:up` |
| `corepack enable` fails with `EPERM` on Windows | Run it once from an Administrator terminal, or install pnpm with `npm install -g pnpm@11.28.9` |
| Tests fail on a missing `hello_world_test` database | The test databases are created when MySQL first initialises. Run `docker compose down -v`, then `pnpm db:up` |

## Documentation

- [Technical PRD](docs/PRD.md): requirements and up-front technical decisions.
- [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md): the rules and context given to AI coding tools.

## Licence

[MIT](LICENSE). Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
