# Hello World: Technical PRD

**v1.0**, 2026-10-30, written before any code, by Mihai Uritescu for the Wolfpack Digital full-stack test.

**v1.1**, 2026-11-04: adds FR-7 to FR-10 (slice S7). See [Revisions](#revisions).

## Goal and scope

Hello World is a real-time chat on a world map. Clicking anywhere drops a pin that opens a chatroom, and anyone can join any pin's conversation. Rooms and messages persist and reach every open browser live.

v1 delivers FR-1 to FR-6 (including the optional real-time part), a one-command local run, tests and CI, and a live AWS demo. v1.1 adds FR-7 to FR-10: pin clusters, a header with an online count, and renaming and deleting by a room's creator. Out of scope: accounts, message editing, reactions, presence beyond the online count, room management beyond a creator's renaming and deleting, older-message paging, i18n, push notifications and moderation.

## Functional requirements

- **FR-1, start screen:** a map of Europe filling the window below the header (FR-10), with zoom top-left, attribution bottom-right (never covered) and a top-right panel reading "Click on the map to start a chat".
- **FR-2, create a room:** a map click adds a pin and opens "Chatroom N". A click or double-click makes exactly one room, a drag none. Enter on the focused map makes one at its centre.
- **FR-3, open a room:** a pin click, or Enter on a focused pin, opens that room and highlights the pin.
- **FR-4, post a message:** a name and a text add author, text and date (`01/02/2017, 14:05`). The text clears; the name stays.
- **FR-5, persistence:** rooms and messages survive reloads and browser or server restarts.
- **FR-6, real time:** other browsers see new pins and messages within 1 s, without duplicates and in the same order.
- **FR-7, pin clusters:** when zoomed out, pins that overlap on screen merge into a circle showing how many rooms it holds. A click on it, or Enter on it when focused, zooms in until they separate. The open room's pin never merges, and nothing merges at the deepest zoom.
- **FR-8, rename a room:** the browser that created a room can rename it (1–40 characters, the same rules as author names) or restore "Chatroom N". Other browsers see the new name within 1 s, and a renamed room still shows its number.
- **FR-9, delete a room:** the browser that created a room can delete it, after confirming, while it has no messages. Its pin disappears for everyone within 1 s, and browsers that have it open go back to the start screen with a notice. After its first message, the room can no longer be deleted.
- **FR-10, header:** a bar above the map shows the app's name, a one-line description and how many windows have the app open, updated within 2 s.

**Assumptions.** Users are anonymous, so a name (1–40 characters, kept in the browser) can be impersonated. Messages have 1–1,000 characters. A room loads its latest 100 messages, the map its 1,000 newest rooms. Room names have 1–40 characters. A room's creator is the browser that created it, which keeps a secret token for the room in `localStorage`: clearing site data or switching browsers gives up control. The online count counts open windows. Dates use local time, and the time of day is an addition to the mockup.

**User interface.** A header runs across the top, the map fills the rest of the window and a 360 px card floats top-right. Before a room is open, the card shows the start text and a keyboard hint. Once a room is open, it shows the title (with the room's number under a custom name), rename and delete buttons for its creator, a scrollable message list, the fields "write your user name here" and "write message here", Submit and a live-connection chip.

Unlike the mockups, the app is called Hello World (a nod to the world map and to everyone's first program). It uses OpenStreetMap's standard tiles and says "No messages yet" in a new room.

## Technical decisions

| Decision | Choice and reason |
|---|---|
| Stack | TypeScript end to end: Vue 3.5, Vite, Vuetify 4 and Leaflet 1.9; Node 24, Fastify 5 and Socket.IO 4; MySQL 8.4 via Kysely and mysql2. One process serves the SPA, API and WebSocket on one origin: no CORS, one image, Docker as the only prerequisite. |
| Data model | `rooms(id, lat, lng, name, revision, owner_token_hash, created_at)` and `messages(id, room_id, client_id, author_name, body, created_at)`, unique on `(room_id, client_id)` and indexed on `(room_id, id)`. Auto-increment ids double as "Chatroom N" and as the message order; InnoDB never reuses them, even after a delete. `revision` grows with every rename. Times are UTC. |
| Real-time delivery | Writes are REST `POST`, `PATCH` and `DELETE` requests. After the commit, the server emits `room:created`, `room:updated` or `room:deleted` to everyone, or `message:created` to the room's channel (Socket.IO). It sends `presence:changed`, the online count, at most once a second. Opening a room subscribes, then loads; a reconnect repeats both. Without WebSockets, the client polls. |
| State management | Pinia setup stores `rooms`, `messages`, `realtime` and `session`. The open room lives in the URL (`?room=`) and the name in `localStorage`. HTTP responses and socket events share one upsert path. |
| Room ownership | Creating a room returns a random 256-bit token, once. The server keeps only its SHA-256, and renames and deletes must carry the token as `Authorization: Bearer`. No accounts are needed, and a leaked database can't be used to control rooms. |
| Clusters | Computed in the browser: a greedy pass over the pins' screen positions at each zoom. No plugin: Leaflet.markercluster has had no release since 2022. |
| Validation | Shared zod schemas, database constraints, per-IP rate limits and strict security headers. |

**Invariants**
- **I1:** Publish only after the database commit.
- **I2:** Subscribe, then read. Reload after every reconnect.
- **I3:** A repeated `client_id` returns the stored message.
- **I4:** Clients drop duplicates by id, keep a room's highest revision, never bring back a deleted room, and sort by id.
- **I5:** Writes go over HTTP only. The socket carries subscriptions and events.
- **I6:** Shutdown closes transports without a disconnect packet, so clients reconnect.
- **I7:** User text renders as plain text only.
- **I8:** A room is deleted only while it has no messages, checked in the transaction that locks its row.

## Improvements and risks

**Improvements:** a remembered name, Enter to send, duplicate-safe retries, deep links, a live-connection chip with resync, loading, empty and error states, keyboard access and a live demo.

**Risks**
- **Spam:** rate and length limits apply. Moderation is out of scope.
- **Map tiles:** OpenStreetMap's public tiles are best-effort. Usage stays light, and switching provider is one setting.
- **Single instance:** accepted for the demo. The scale-out path is in the infrastructure notes.
- **Look-alike room names:** a creator can name a room after another one. The room's number stays visible under the name.

## Revisions

- **v1.1, 2026-11-04 (slice S7):** FR-7 to FR-10 were added at the product owner's request. v1.0 had left clustering, presence and room management out of scope. Now the map sits below a header, pins cluster, the header counts open windows, and a room's creator can rename it or delete it while it's empty. The data model, the real-time events and I4 were extended, and I8 was added.
