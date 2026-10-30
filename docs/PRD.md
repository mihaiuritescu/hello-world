# Hello World: Technical PRD

**v1.0**, 2026-10-30, written before any code, by Mihai Uritescu for the Wolfpack Digital full-stack test.

## Goal and scope

Hello World is a real-time chat on a world map. Clicking anywhere drops a pin that opens a chatroom, and anyone can join any pin's conversation. Rooms and messages persist and reach every open browser live.

v1 delivers FR-1 to FR-6 (including the optional real-time part), a one-command local run, tests and CI, and a live AWS demo. Out of scope: accounts, message editing, reactions, presence, room management, clustering, older-message paging, i18n, push notifications and moderation.

## Functional requirements

- **FR-1, start screen:** a full-window map of Europe with zoom top-left, attribution bottom-right (never covered) and a top-right panel reading "Click on the map to start a chat".
- **FR-2, create a room:** a map click adds a pin and opens "Chatroom N". A click or double-click makes exactly one room, a drag none. Enter on the focused map makes one at its centre.
- **FR-3, open a room:** a pin click, or Enter on a focused pin, opens that room and highlights the pin.
- **FR-4, post a message:** a name and a text add author, text and date (`01/02/2017, 14:05`). The text clears; the name stays.
- **FR-5, persistence:** rooms and messages survive reloads and browser or server restarts.
- **FR-6, real time:** other browsers see new pins and messages within 1 s, without duplicates and in the same order.

**Assumptions.** Users are anonymous, so a name (1–40 characters, kept in the browser) can be impersonated. Messages have 1–1,000 characters. A room loads its latest 100 messages, the map its 1,000 newest rooms. Dates use local time, and the time of day is an addition to the mockup.

**User interface.** The map fills the window and a 360 px card floats top-right. Before a room is open, the card shows the start text and a keyboard hint. Once a room is open, it shows the title, a scrollable message list, the fields "write your user name here" and "write message here", Submit and a live-connection chip.

Unlike the mockups, the app is called Hello World (a nod to the world map and to everyone's first program). It uses OpenStreetMap's standard tiles and says "No messages yet" in a new room.

## Technical decisions

| Decision | Choice and reason |
|---|---|
| Stack | TypeScript end to end: Vue 3.5, Vite, Vuetify 4 and Leaflet 1.9; Node 24, Fastify 5 and Socket.IO 4; MySQL 8.4 via Kysely and mysql2. One process serves the SPA, API and WebSocket on one origin: no CORS, one image, Docker as the only prerequisite. |
| Data model | `rooms(id, lat, lng, created_at)` and `messages(id, room_id, client_id, author_name, body, created_at)`, unique on `(room_id, client_id)` and indexed on `(room_id, id)`. Auto-increment ids double as "Chatroom N" and as the message order. Times are UTC. |
| Real-time delivery | Writes are REST `POST`s. After the commit, the server emits `room:created` to everyone or `message:created` to the room's channel (Socket.IO). Opening a room subscribes, then loads; a reconnect repeats both. Without WebSockets, the client polls. |
| State management | Pinia setup stores `rooms`, `messages`, `realtime` and `session`. The open room lives in the URL (`?room=`) and the name in `localStorage`. HTTP responses and socket events share one upsert path. |
| Validation | Shared zod schemas, database constraints, per-IP rate limits and strict security headers. |

**Invariants**
- **I1:** Publish only after the database commit.
- **I2:** Subscribe, then read. Reload after every reconnect.
- **I3:** A repeated `client_id` returns the stored message.
- **I4:** Clients drop duplicates by id and sort by id.
- **I5:** Writes go over HTTP only. The socket carries subscriptions and events.
- **I6:** Shutdown closes transports without a disconnect packet, so clients reconnect.
- **I7:** User text renders as plain text only.

## Improvements and risks

**Improvements:** a remembered name, Enter to send, duplicate-safe retries, deep links, a live-connection chip with resync, loading, empty and error states, keyboard access and a live demo.

**Risks**
- **Spam:** rate and length limits apply. Moderation is out of scope.
- **Map tiles:** OpenStreetMap's public tiles are best-effort. Usage stays light, and switching provider is one setting.
- **Single instance:** accepted for the demo. The scale-out path is in the infrastructure notes.
