# AGENTS.md

Guidance for AI coding agents, and for humans, working on **Hello World**, a real-time chat on a world map. This file is tool-agnostic; `CLAUDE.md` imports it.

Read [`docs/PRD.md`](docs/PRD.md) first. It holds the requirements (FR-1 to FR-6) and the real-time invariants (I1 to I7) referenced below.

> Drafted on 2026-10-30, before the scaffold. The commands and the `.claude/` tooling arrive with slice S0.

## Commands

| Task | Command |
|---|---|
| Install dependencies | `pnpm install` |
| Start MySQL, migrate, run API and web | `pnpm dev`, then open http://localhost:5173 |
| Run the whole app in Docker | `docker compose up --build`, then open http://localhost:3000 |
| All checks: lint, types, licences, tests | `pnpm verify` |
| One test file | `pnpm exec vitest run src/server/rooms/rooms.routes.test.ts` |
| End-to-end tests | `pnpm test:e2e` |
| Format | `pnpm format` |

Integration tests need MySQL, so run `pnpm db:up` first.

## Repository map

- `src/shared/`: types, limits and zod schemas used by both client and server.
- `src/server/`:
  - the Fastify app (`app.ts`) and `config.ts`;
  - database access (`db/`);
  - features (`rooms/`, `messages/`);
  - real-time delivery (`realtime/`).
- `src/client/`: the Vue app:
  - Pinia stores (`stores/`);
  - features (`features/map`, `features/chat`);
  - helpers (`lib/`).
- `e2e/`: Playwright specs.
- `scripts/`: repository tooling.
- `infra/aws/`: the CloudFormation template and the deploy runbook.
- `deploy/aws/`: the files the EC2 host runs.
- `docs/`: PRD, infrastructure and costs, AI setup, review reports.

## Architecture rules

- **Writes go through REST.** The socket carries only subscriptions and server events (I5).
- **Layering:**
  - routes depend on repositories and on the `Broadcaster` interface, nothing else;
  - repositories never import Fastify;
  - only `realtime/socket-server.ts` knows which Socket.IO adapter runs.
- **Commit, then broadcast.** Broadcast only after the database write has committed (I1).
- **Client data flow:** all server data lives in Pinia stores. HTTP responses and socket events go through the same `upsert` functions (I4).
- **Leaflet stays out of Vue reactivity.** Create Leaflet objects with `markRaw` and hold them in a `shallowRef` or a plain variable.
- **Plain-text rendering.** Render user text with interpolation only: no `v-html`, no Leaflet HTML APIs (I7).

## Conventions

- **TypeScript:** strict mode everywhere.
- **Server code runs `.ts` directly** through Node's type stripping, so:
  - use only erasable syntax (no enums, namespaces or parameter properties);
  - import types with `import type`;
  - keep the `.ts` extension in relative imports.
- **Vue:** `<script setup lang="ts">`, PascalCase components, composables named `useX`.
- **Server files:** `<feature>.<role>.ts`, for example `rooms.routes.ts`.
- **Naming across layers:** SQL is snake_case and JSON camelCase. Convert in `toRoom()` and `toMessage()`.
- **Socket events:** `<entity>:<past tense>` for server facts (`message:created`), `<entity>:<verb>` for client commands (`room:subscribe`).
- **Comments:** explain why, not what. No dead or commented-out code.

## Database (MySQL 8.4)

- **One DDL statement per migration file.** MySQL DDL commits implicitly and can't be rolled back.
- **Migrations run only as a one-off step:** `pnpm db:migrate`, the compose `migrate` service, or the deploy. Never on app start.
- **Every connection uses UTC and strict SQL mode**, set in `db/database.ts`.
- **Handle duplicate keys (errno 1062) and missing parents (errno 1452) explicitly.** Never use `INSERT IGNORE`.
- **Pin one connection** for session settings such as `FOREIGN_KEY_CHECKS`.

## Testing

- **Every change ships with tests at the right level:**
  - unit tests for stores, schemas and helpers;
  - integration tests with `app.inject()` against MySQL;
  - Playwright for user-visible flows.
- **No sleeps or arbitrary timeouts.** Wait for events, responses or UI state.
- **Tests are independent.** Integration tests reset the tables; e2e tests use their own database.
- **Name a test after the behaviour it proves**, for example `returns the stored message when the clientId repeats`.

## Security

- **Validate every input at the boundary** with the shared zod schemas: HTTP bodies and params, socket payloads, environment.
- **Never log** message bodies, author names or secrets.
- **Never commit secrets.** Configuration comes from environment variables, documented in `.env.example`.
- **Headers:** `@fastify/helmet` owns the security headers. HTTPS-only headers turn on when `PUBLIC_URL` uses https.

## Dependencies

- Prefer the platform and existing dependencies. Add a package only when it removes real work.
- Every package must be free to use, with no payment. Check the licence with `npm view <pkg> license`, then run `pnpm check:licenses`.
- Pin exact versions (`pnpm add -E`).
- **Where a package goes:**
  - **`dependencies`:** packages the server needs at runtime. They are the only ones installed in the Docker image.
  - **`devDependencies`:** packages only bundled into the browser build, and all tooling.
  - `pnpm check:licenses` checks both lists.

## Cloud safety

- **Agents never:**
  - run `aws` or `gh` commands;
  - read `~/.aws`;
  - print or store credentials or secret values.
- **Agents write the AWS steps** into `infra/aws/RUNBOOK.md`, and a human runs them.
- **No agent session runs** while an AWS session is signed in.

## Git

- **Commit messages:** Conventional Commits, `type(scope): summary`. The body explains why and adds `Refs: FR-n` where it applies.
- **Commit size:** small, focused commits on `main`; CI runs on every push.
- **History:** never force-push, and never rewrite published history.

## Delivery slices

| Slice | Content |
|---|---|
| S0 | Skeleton: tooling, configs, health routes, migrations, compose, Dockerfile, CI, and the map with an empty panel (FR-1) |
| S1 | Rooms: create, list, select, deep link (FR-2, FR-3, FR-5) |
| S2 | Messages: list, compose, send, persist (FR-4, FR-5) |
| S3 | Real time: Socket.IO, live pins and messages, resync (FR-6) |
| S4 | Hardening: UI states, accessibility, rate limits, docs |
| S5 | AWS demo deploy |
| S6 | Self-review and fixes |

## Definition of done

A change is done when:
1. `pnpm verify` passes, plus `pnpm test:e2e` for user-visible changes;
2. tests cover the new behaviour and fail without it;
3. the README, PRD or infrastructure docs reflect any change in behaviour or setup;
4. it is committed with a Conventional Commit message.
