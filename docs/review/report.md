# Review report

- **Date and commit:** 2026-11-04, `bb23f6b` (tag `v1.1.0` plus a wording trim of the PRD).
- **Scope:** the whole codebase.
- **Reviewers:** Claude Opus 5.5 in Claude Code, all read-only: 4 lens agents (correctness, security, maintainability, and tests and docs) and 11 verifier agents, one per S2 and S3 finding.

## Verdict

The release candidate holds up where it matters most. The write path, the invariants I1 to I8, input validation, the security headers, the AWS stack and the deploy trust all held under tracing, and both gates pass.

What the review found sits at the edges:
- **The map (REV-02, REV-03, REV-04):** rooms at one spot that can't all be clicked, pins missing from the next copy of the world, and keyboard focus lost on a live update.
- **The socket server (REV-01):** one connection can open many sockets, which inflates the online count past the per-address cap.
- **A local MySQL port open to the network (REV-05).**
- **A missing guard test for I1 (REV-06).**
- **Two small slips:** a duplicated rule (REV-09) and a stale note (REV-08).

None blocks the release.

| Severity | Confirmed | Plausible | Refuted | Not verified |
|---|---:|---:|---:|---:|
| S1 | 0 | 0 | 0 | |
| S2 | 3 | 0 | 0 | |
| S3 | 5 | 0 | 3 | |
| S4 | | | | 2 |

## Gates

| Gate | Result |
|---|---|
| `pnpm verify` | Passed: ESLint, the Prettier check and vue-tsc; licences (397 packages); hidden characters (174 files); Vitest, 510 tests in 34 files, unit and integration against MySQL 8.4 |
| `pnpm test:e2e` | Passed: 71 Playwright tests in Chromium, plus WebKit for the `@smoke` ones |

## Funnel

Raw 14 → deduplicated 13 → 11 verified: 8 confirmed, 0 plausible, 3 refuted. The 2 S4 findings aren't verified, as the process says. The false-positive rate among verified findings is 3 of 11 (27%).

**The merge.** Two findings cited the same circle-key lines of `useRoomMarkers.ts:149`: the correctness lens's lost focus and the maintainability lens's string-key lookup. They became REV-04. Other findings in that file describe different code and stayed separate.

| Lens | Raw | Confirmed | Refuted | Not verified |
|---|---:|---:|---:|---:|
| Correctness | 3 | 3 | 0 | 0 |
| Security | 2 | 2 | 0 | 0 |
| Maintainability | 5 (1 merged) | 1 | 2 | 1 |
| Tests and docs | 4 | 2 | 1 | 1 |

## Findings

### REV-01 [S2][security] One WebSocket can open many Socket.IO sockets, inflating the online count and the broadcast fan-out past the per-address cap
- **Where:** `src/server/realtime/socket-server.ts:96-103`, `:122`, `:177`, `:217`
- **Evidence:**
  - The cap counts Engine.IO connections: `io.engine.on('connection', … openByAddress.set(address, (openByAddress.get(address) ?? 0) + 1)`.
  - Presence counts Socket.IO sockets: `presence.joined(socket)` and `const online = (): number => io.of('/').sockets.size`.
  - In socket.io 4.8.4, `dist/client.js:206-208` connects a new socket for every CONNECT packet while `this.nsps.get('/')` is still empty. `nsps` is set only after an `await` and a `process.nextTick` (`dist/namespace.js:212-222`). ws 8.21.3 emits all frames of one TCP read synchronously (`allowSynchronousEvents`, the default).
- **Scenario:**
  - Given the default `SOCKETS_PER_ADDRESS=50` and one open browser window.
  - When a script opens one WebSocket to `/socket.io/?EIO=4&transport=websocket`, with no Origin header (which `isOwnOrigin` accepts), and writes ten CONNECT frames (`40`) in one TCP write.
  - Then ten sockets join `/`, and the header goes from "1 online" to "11 online". Each extra socket also gets its own copy of every broadcast.
  - `closeWhenStalled` caps one burst at about 250 sockets per connection, so 50 connections from one address could add about 12,500 to the count.
- **Rule:** FR-10 (the header counts open windows); the cap's contract in `src/server/config.ts:72-73`; REVIEW.md Security (socket limits).
- **Fix:**
  - Add an `io.use` middleware, before `io.on('connection')`, that accepts one socket per `socket.conn` and releases it on disconnect. This bounds both the count and the fan-out. `io.engine.clientsCount` would fix only the count.
  - **Regression test:** a raw `node:net` client writes ten `40` frames in one write, and a normal client that joins afterwards hears `{ online: 2 }`. ws isn't a direct dependency.
- **Confidence:** high
- **Verdict:** CONFIRMED (1/1). The verifier traced ws, Engine.IO, socket.io-parser and the in-memory adapter, and estimated the bound.

### REV-02 [S2][correctness] Rooms at the same spot can't all be clicked: at the deepest zoom their pins sit on one pixel
- **Where:** `src/client/features/map/useRoomMarkers.ts:98-100`, `:177-178`; `src/client/features/map/useLeafletMap.ts:57-60`; `e2e/clusters.spec.ts:200-209`
- **Evidence:**
  - `const radius = zoom >= instance.getMaxZoom() ? 0 : CLUSTER_RADIUS_PX`, so `clusterRooms` gives every room its own pin.
  - `zoomTo`'s comment: "Rooms that share one spot fit at any zoom, so they get the deepest, where nothing merges."
  - Enter creates a room at `toRoomCoordinates(map.value.getCenter())`.
  - The e2e test asserts only `toBeVisible()` for both pins.
- **Scenario:**
  - Given two rooms at exactly the same coordinates, for example from two presses of Enter on an untouched map, whose centre doesn't move in between.
  - When a mouse or touch user clicks their "2 chatrooms" circle.
  - Then the map zooms to 19, where both pins get the same box and z-index (`Marker.js:204`, `:318`). The pin added later takes every click, and once its room is open, `zIndexOffset` 1000 keeps it on top. The covered room can be reached only with Tab or a `?room=` link. `pin(page, 1).click()` would fail Playwright's hit-target check.
- **Rule:** FR-3 (a pin click opens that room) and FR-7; REVIEW.md S2 ("a test that hides a bug").
- **Fix:** at the deepest zoom, fan out the pins that share a screen position on a small ring, which moves only the icons. Extend the e2e test to click each pin and expect its room's heading.
- **Confidence:** high
- **Verdict:** CONFIRMED (1/1). The verifier added that `getCenter()` is recomputed after `invalidateSize()`, but gives the same result for both presses.

### REV-03 [S2][correctness] Pins are drawn only on the original copy of the world, so the next copy shows none, and a click there creates a pin out of view
- **Where:** `src/client/features/map/useLeafletMap.ts:31-38`; `src/client/features/map/coordinates.ts:14`; `src/client/features/map/useRoomMarkers.ts:139`; `src/client/features/map/tiles.ts:10-14`
- **Evidence:**
  - The map sets `worldCopyJump: true`, with no `maxBounds` and no `noWrap`, so the tiles repeat (`GridLayer.js:618`).
  - `const { lat, lng } = Math.abs(latlng.lng) <= 180 ? latlng : latlng.wrap()`.
  - `L.marker([room.lat, room.lng], …)` is placed with no wrap (`Marker.js:204`).
- **Scenario:**
  - Given a 1280×720 window at zoom 3, panned east until the centre is at lng 150. The view then spans about lng 37 to 262, and its right third is the next copy of the world.
  - When the user clicks Hawaii in that copy (event lng about 205).
  - Then the room is stored at lng -155 and opens in the panel. Its pin, though, is drawn 2,048 px to the left, out of view, and the rooms in the Americas are missing from that strip.
  - Wheel or pinch zoom around a point in the copy moves the centre past 180 without any drag, and Enter on the map then creates its room out of view too.
- **Rule:** FR-2 (a map click adds a pin), FR-3, FR-6.
- **Fix:** either of these.
  - Draw pins and circles on the copy nearest the view's centre, shifting by multiples of 360 on `moveend` and `zoomend`. The clustering and the circle zoom must use the shifted longitudes too.
  - Restrict the map to one world: `maxBounds`, `noWrap`, and a minimum zoom that fills the window.

  **E2e regression test:** pan until lng 180 is mid-view, click east of it, and expect the new pin in the viewport.
- **Confidence:** high
- **Verdict:** CONFIRMED (1/1). The verifier traced Leaflet's drag, wheel zoom and keyboard paths, and the click-to-store chain.

### REV-04 [S3][correctness] A live update that regroups the focused pin or circle drops keyboard focus to the page
- **Where:** `src/client/features/map/useRoomMarkers.ts:67-74`, `:81-86`, `:89-96`, `:148-150`
- **Evidence:**
  - In `sync()`: `for (const [key, circle] of circles) { if (drawnCircles.has(key)) continue; circle.remove(); circles.delete(key) }`.
  - `const key = group.rooms.map((room) => room.id).join(',')`.
  - Focus is restored only in `onZoomEnd`, after an Enter zoom.
  - The merged maintainability note: `markerOf` recovers a circle's rooms with `key.split(',')`.
- **Scenario:**
  - Given a keyboard user has tabbed to the "3 chatrooms" circle.
  - When another window creates a room within 40 px of the group's first room, and `room:created` triggers `sync()`.
  - Then the circle's key changes from "1,2,3" to "1,2,3,4". The focused marker is removed from the DOM and focus falls to `<body>`, so the next Enter does nothing.
  - The verifier found more triggers: a `room:deleted` for a member, a reload after a reconnect, and the 1,000-room cap dropping a member.
- **Rule:** FR-3 and FR-7 (Enter on a focused pin or circle); REVIEW.md races (events that arrive during an interaction); WCAG 2.4.3.
- **Fix:** before `sync()` removes markers, note which room's marker holds `document.activeElement`, and after drawing, focus `markerOf` that room. Storing each circle with a `Set` of its room ids would make that lookup plain. **Regression test, with two windows:** focus the circle in one, create a room inside it from the other, and expect the "4 chatrooms" button to be focused.
- **Confidence:** high
- **Verdict:** CONFIRMED (1/1). Corrections: "within 40 px" means of the group's first room. The string-key lookup works for integer ids, so on its own it's taste.

### REV-05 [S3][security] The local MySQL is published on every network interface, with root password "root"
- **Where:** `compose.yaml:22`, `:28`
- **Evidence:** `MYSQL_ROOT_PASSWORD: root` and `- '${DB_PORT:-3307}:3306'`, with no host address.
- **Scenario:**
  - Given a reviewer runs `docker compose up --build`, or `pnpm dev`, `pnpm verify` or `pnpm test:e2e`, which all start this service, on a laptop on shared Wi-Fi.
  - When another device runs `mysql -h <laptop-ip> -P 3307 -u root -proot`.
  - Then it controls every local database. Docker binds a published port without an address to 0.0.0.0, and on Linux its rules bypass ufw.
- **Rule:** REVIEW.md Security ("a private … database"). The rule for local credentials (`.claude/rules/infra.md`) permits fixed test values, but not a database reachable from the network.
- **Fix:** publish `'127.0.0.1:${DB_PORT:-3307}:3306'`. Every client already connects through localhost. **Regression test:** fail on any published port of the root `compose.yaml` without `127.0.0.1:`. The deploy compose must keep 80 and 443 public.
- **Confidence:** medium
- **Verdict:** CONFIRMED (1/1), for the MySQL port. The verifier found the app's port 3000 is not a vulnerability: it serves the same anonymous chat as the public demo.

### REV-06 [S3][tests] Invariant I1 (publish only after the commit) has no test that would fail if it broke
- **Where:** `src/server/messages/messages.routes.test.ts:21`, `:70-74`; `src/server/rooms/rooms.routes.test.ts:22-24`, `:102`, `:226`, `:355`
- **Evidence:** the recording broadcasters only push into arrays, as in `messageCreated: (message) => announced.push(message)`, and every check runs after the awaited response.
- **Scenario:**
  - Given a rename or delete that broadcasts inside its Kysely transaction, before COMMIT. Kysely commits after the callback returns (`kysely.js:690-691`).
  - When the tests run.
  - Then they still pass, so a client could get the event, reload and not find the change.
  - Broadcasting before the write, or on a refused write, is already caught (`messages.routes.test.ts:115`, `:137`; `rooms.routes.test.ts:290`, `:368`, `:397`).
- **Rule:** I1; AGENTS.md Testing ("tests fail without the behaviour").
- **Fix:** a test dialect or driver that counts open transactions, which the recording broadcaster checks when it's called. A check from a second connection wouldn't work, because the broadcaster is synchronous and would usually see the row only after COMMIT. Prove the test fails against a variant that broadcasts inside the transaction.
- **Confidence:** medium
- **Verdict:** CONFIRMED (1/1). The current code is correct, and the layering makes the break hard to introduce, so it stays S3.

### REV-08 [S3][docs] AGENTS.md opens with a stale "drafted before the scaffold" note
- **Where:** `AGENTS.md:7`
- **Evidence:** "Drafted on 2026-10-30, before the scaffold. The commands and the `.claude/` tooling arrive with slice S0."
- **Scenario:**
  - Given a contributor or an AI tool reads AGENTS.md first.
  - When they reach the note.
  - Then they may doubt that the commands and the `.claude/` tooling exist, although they shipped in S0 and grew through S7.
- **Rule:** the maintainability reviewer's check that AGENTS.md describes the repository as it is; REVIEW.md S3 ("a documentation slip").
- **Fix:** delete the note. The PRD already records its own pre-code origin.
- **Confidence:** high
- **Verdict:** CONFIRMED (1/1), at line 7 (the finding said line 5).

### REV-09 [S3][maintainability] The room-id rule is written twice, once on the client, and the client's copy is barely tested
- **Where:** `src/client/stores/session.ts:66-68`; `src/shared/schemas.ts:19-21`; `src/client/stores/session.test.ts:22`
- **Evidence:**
  - `session.ts`: `!/^[1-9]\d*$/.test(value)`, then `Number.isSafeInteger(id)`.
  - `schemas.ts`: `.regex(/^[1-9]\d*$/, …).transform(Number).pipe(z.number().max(Number.MAX_SAFE_INTEGER))`.
  - The client test covers only `abc`, `0`, `-3`, `1.5` and an empty search.
- **Scenario:**
  - Given the client parse is loosened, for example to `Number(value)` with `isSafeInteger` and `> 0`.
  - When `?room=01`, `0x1` or `1e0` is opened.
  - Then every client test still passes, while the server schema rejects those forms (`schemas.test.ts:33`).
  - If instead the server rule were narrowed, the API would answer 400. The user would then see "Couldn't open …" rather than "… doesn't exist".
- **Rule:** REVIEW.md Maintainability ("Logic is not duplicated between client and server").
- **Fix:**
  - Add a zod-free `src/shared/roomId.ts`, in the pattern of `text.ts`, used by `parseRoomId` and by `RoomIdParamsSchema`. The browser never loads zod: `text.ts:3`.
  - Add `01`, `0x1`, `1e0` and `9007199254740993` to `session.test.ts`.
- **Confidence:** high
- **Verdict:** CONFIRMED (1/1). The verifier narrowed the scenario and changed the fix. Today both rules behave the same.

### REV-12 [S4][maintainability] The rate-limit messages are written out in four places
- **Where:** `src/client/App.vue:57`, `:88-90`; `src/client/stores/drafts.ts:57-58`; `src/client/features/chat/RoomHeader.vue:64`, `:116`
- **Evidence:** "You're creating chatrooms too fast. Wait a minute, then try again." and three more like it, each behind its own `isRateLimited(error) ?`. One says "Wait a moment" instead.
- **Scenario:**
  - Given a limit's window changes from one minute.
  - When a developer greps for one of the strings.
  - Then some messages keep the old wording.
- **Rule:** REVIEW.md Maintainability (duplication).
- **Fix:** one `rateLimitedMessage(action)` helper next to `isRateLimited`.
- **Confidence:** medium
- **Verdict:** not verified (S4).

### REV-13 [S4][docs] The README's and the runbook's tag examples name v1.0.0, which already exists
- **Where:** `README.md:107`; `infra/aws/RUNBOOK.md:257`, `:296-297`
- **Evidence:** "Pushing a version tag such as `v1.0.0` deploys it", and `git tag -a v1.0.0 -m "v1.0.0"`.
- **Scenario:**
  - Given someone follows the runbook literally.
  - When they run the tag commands.
  - Then git refuses, because the tag exists.
- **Rule:** the docs match the project state.
- **Fix:** use a placeholder, `vX.Y.Z`, as AGENTS.md does.
- **Confidence:** medium
- **Verdict:** not verified (S4).

## Appendix: refuted findings

- **REV-07 [S3][docs] The README promises a review report and a triage note that don't exist, and its status line is stale** (`README.md:7`, `:129`).
  - **Refuted (1/1):** the missing files are this review's own outputs, which REVIEW.md steps 5 and 6 produce after it.
  - The status line "the self-review comes next" is accurate at the reviewed commit.
  - `docs/review/README.md` names the result files as code, not as links, so nothing is broken.
  - The verifier's note: update the README's status line when the report and the triage land.
- **REV-10 [S3][maintainability] The rooms and messages stores re-implement stale-load bookkeeping** (`src/client/stores/rooms.ts`, `messages.ts`).
  - **Refuted (1/1):** the two mechanisms differ by design, and tests pin both.
  - The rooms store keeps an older list's rooms; the messages store drops an older page outright.
  - A rooms "ready" status drives polling; a messages "ready" status with no page would show a false "No messages yet".
  - Three of the listed variables guard deleted rooms (FR-9, I4), and messages have no equivalent.
  - Only a three-line failure guard is shared, with tests on both sides: S4 at most.
- **REV-11 [S3][maintainability] The PRD's state decision lists four stores, but the code has five.**
  - **Refuted (1/1):** the reviewer quoted the PRD from before the wording trim in `bb23f6b`. At the reviewed commit, the decision names no stores (`docs/PRD.md:29`).

## Limits

- **Nothing was executed during the review.** The agents only read: every verdict comes from tracing the code, including the installed library code (Leaflet, socket.io, Engine.IO, ws and Kysely). None was reproduced in a running app.
- **Coverage is partial:**
  - The maintainability reviewer skipped the migrations, `config.ts`, `errors.ts`, `http.ts`, `drafts.ts`, `MessageComposer.vue`, `clusterRooms.ts` and the tests.
  - The tests and docs reviewer read only some of the tests in detail.
  - The lens reviewers worked from the PRD as it stood before the trim, which led to REV-11.
- **Not covered:**
  - the live AWS account and GitHub settings, such as rulesets and package visibility;
  - the mockups, which aren't in the repository;
  - Firefox and real phones;
  - load and performance;
  - accessibility beyond the automated axe scans and the code.
- **One vote:** as the process says, each S2 and S3 finding had one verifier. With no S1 findings, no finding got three votes.
