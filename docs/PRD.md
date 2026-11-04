# Hello World: Technical PRD

**v1.1**, 2026-11-04, by Mihai Uritescu for the Wolfpack Digital full-stack test. v1.0 (2026-10-30, tag `prd-v1.0`) was written before any code; v1.1 adds FR-7 to FR-10 at the product owner's request.

Hello World is a real-time chat on a world map: clicking anywhere drops a pin that opens a chatroom, and anyone can join any pin's conversation. Rooms and messages persist and reach every open browser live. It ships FR-1 to FR-10 (FR-6 is the brief's optional part), a one-command local run, tests, CI and a live AWS demo. Out of scope: accounts, message editing, reactions, presence beyond an online count, older-message paging, i18n, push notifications and moderation.

## Functional requirements

- **FR-1, start screen:** a map of Europe below the header, zoom top-left, attribution bottom-right (never covered), and a top-right panel: "Click on the map to start a chat".
- **FR-2, create a room:** a map click adds a pin and opens "Chatroom N"; a click or double-click makes one room, a drag none. Enter on the focused map makes one at its centre.
- **FR-3, open a room:** a pin click, or Enter on a focused pin, opens its room and highlights the pin.
- **FR-4, post a message:** a name and a text add author, text and date (`01/02/2017, 14:05`); the text clears, the name stays. A new room says "No messages yet".
- **FR-5, persistence:** rooms and messages survive reloads and browser or server restarts.
- **FR-6, real time:** other browsers see new pins and messages within 1 s, once each and in the same order.
- **FR-7, pin clusters:** zoomed out, overlapping pins merge into a counted circle. A click, or Enter, zooms in until its rooms show clear of the panel. The open room never merges.
- **FR-8, rename a room:** its creator can rename it or restore "Chatroom N", for all within 1 s.
- **FR-9, delete a room:** its creator can delete an empty room after confirming. Its pin goes for everyone within 1 s, and windows showing it return to the start screen.
- **FR-10, header:** the app's name and description, and the number of open windows, updated within 2 s.

**Assumptions.** Users are anonymous, so names can be impersonated. Author names (kept in the browser) and room names have 1–40 characters. Messages have 1–1,000 characters; a room loads its latest 100, the map its 1,000 newest rooms. A room's creator is the browser that holds its secret token. Dates are local; the time of day is an addition to the mockup.

**User interface.** A header, the map, and a 360 px card top-right (below or beside the zoom buttons on small screens) with the start text, or the room's title, its creator's rename and delete buttons, the messages, the fields "write your user name here" and "write message here", Submit and a live-connection chip. The app is called Hello World, a nod to the map and to everyone's first program.

## Technical decisions

- **Stack:** TypeScript end to end: Vue 3.5, Vuetify 4, Leaflet 1.9; Node 24, Fastify 5, Socket.IO 4; MySQL 8.4 via Kysely. One process serves the SPA, API and WebSocket on one origin: no CORS, one image, only Docker needed.
- **Data model:** `rooms(id, lat, lng, name, revision, owner_token_hash, created_at)` and `messages(id, room_id, client_id, author_name, body, created_at)`, unique on `(room_id, client_id)`. Ids are "Chatroom N" and the message order; InnoDB never reuses them. Times are UTC.
- **Real-time delivery:** writes are REST requests. After the commit, the server emits `room:created`, `room:updated` or `room:deleted` to all, `message:created` to the room's channel, and the online count at most once a second. Opening a room subscribes, then loads, again after every reconnect; without WebSockets, the client polls.
- **State:** Pinia stores, with the open room in the URL (`?room=`) and the name in `localStorage`. HTTP responses and socket events share one upsert path.
- **Room ownership:** creating a room returns a random 256-bit token once. The server keeps its SHA-256, and renames and deletes send it as a bearer token: no accounts, and a leaked database can't control rooms.
- **Clusters:** computed in the browser; Leaflet.markercluster has had no release since 2022.
- **Validation:** shared zod schemas, database constraints, per-IP rate limits and security headers.

**Invariants**
- **I1:** Publish only after the database commit.
- **I2:** Subscribe, then read. Reload after every reconnect.
- **I3:** A repeated `client_id` returns the stored message.
- **I4:** Clients drop duplicates, keep a room's newest revision, never revive deleted rooms, and sort by id.
- **I5:** Writes go over HTTP only. The socket carries subscriptions and events.
- **I6:** Shutdown closes transports without a disconnect packet, so clients reconnect.
- **I7:** User text renders as plain text only.
- **I8:** Only an empty room is deleted, checked in the transaction that locks its row.

**Improvements:** a remembered name, Enter to send, duplicate-safe retries, deep links, a live-connection chip with resync, loading, empty and error states, keyboard access and a live demo.

**Risks:** spam (rate and length limits, no moderation), best-effort map tiles (one setting switches provider), a single instance (see the infrastructure notes) and look-alike room names (numbers stay visible).
