# Delta review report

- **Date and commit:** 2026-11-04, `4194891`.
- **Scope:** the seven fix commits for the review of `bb23f6b`, `52c6ac7..4194891`: REV-01, 02, 03, 05, 08, 09 and 13 in [report.md](report.md).
- **Reviewers:** Claude Opus 5.5 in Claude Code, all read-only: 4 lens agents, and 9 verifier agents, one per finding.

## Verdict

Five fixes hold as they are: REV-01, REV-05, REV-08, REV-09 and REV-13.
- The security lens found nothing.
- REV-01's middleware can't be bypassed, and it never locks out a real client, whose reconnects always open a new connection.
- The shared room-id parser accepts exactly what the old schema did.

The two map fixes each fix what they were meant to, and the new tests fail without them. But each brought a regression of its own, at S2:
- **REV-D01:** the one-world bounds of REV-03 keep the map's east edge under the chat panel.
- **REV-D02:** REV-02's fan-out puts pins in id order, not on-screen order.

The other findings are smaller:
- three test gaps: REV-D06, REV-D07 and REV-D08;
- two documentation slips: REV-D04 and REV-D05;
- a tile request leak on very wide screens: REV-D03;
- a duplicated pin size, which the e2e tests already cover: REV-D09.

| Severity | Confirmed | Plausible | Refuted | Not verified |
|---|---:|---:|---:|---:|
| S1 | 0 | 0 | 0 | |
| S2 | 2 | 0 | 0 | |
| S3 | 6 | 0 | 0 | |
| S4 | 1 | | | 0 |

## Gates

| Gate | Result |
|---|---|
| `pnpm verify` | Passed: lint, format, types, licences, hidden characters (180 files), Vitest 538 tests in 37 files |
| `pnpm test:e2e` | Passed: 73 tests, in Chromium plus WebKit for the `@smoke` ones |

## Funnel

Raw 10 → deduplicated 9 → 9 verified: 9 confirmed, 0 plausible, 0 refuted. The false-positive rate was 0 of 9.
- **The merge:** the maintainability lens's stale schema comment (`src/shared/schemas.ts:6`) joined the tests and docs lens's REV-D05, at the same line.
- **One severity change:** REV-D09 came down from S3 to S4.

| Lens | Raw | Confirmed |
|---|---:|---:|
| Correctness | 3 | 3 |
| Security | 0 | 0 |
| Maintainability | 2 (1 merged) | 1 |
| Tests and docs | 5 | 5 |

## Per fix

| Fix | Holds | Regression |
|---|---|---|
| REV-01, one socket per connection (`7a11a60`) | Yes, and its test fails without it | None; the release on disconnect is untested (REV-D06) |
| REV-02, pins at one spot fan out (`e34ea66`) | Yes, for the reported case | REV-D02; the return to a pin's own place is untested (REV-D07) |
| REV-03, one world (`1091f4e`) | Yes, for the reported case | REV-D01, REV-D03 |
| REV-05, MySQL on 127.0.0.1 (`7b12138`) | Yes | Its test checks one line only (REV-D08) |
| REV-09, one room-id parser (`4c3d977`) | Yes, behaviour unchanged | None |
| REV-08, the AGENTS.md note (`d2a4254`) | Yes | None |
| REV-13, tags as vX.Y.Z (`4194891`) | Yes | The runbook's command now pushes a literal `vX.Y.Z` (REV-D04) |

## Findings

### REV-D01 [S2][correctness] The one-world bounds keep the map's east edge under the chat panel, so rooms in the far east can't be dragged clear of it
- **Where:** `src/client/features/map/useLeafletMap.ts:35-37`; `src/client/features/map/coordinates.ts:11-14`; `src/client/features/chat/ChatPanel.vue:83-93`
- **Evidence:**
  - The map now sets `maxBounds: DRAWABLE_WORLD, maxBoundsViscosity: 1`, which replaced `worldCopyJump: true`.
  - Leaflet clamps the view's edges, not its centre, on drags (`Map.Drag.js:103-106`, `:155`), on `setView` and after moves (`Map.js:1538-1541`, `:1273-1277`). So lng 180 never passes the map's right edge.
  - The chat panel floats over the map's right side.
- **Scenario:**
  - Given a 1280×720 window, an open room with many messages (the panel covers x 904–1264), and a room in Auckland (174.76°E).
  - When the user drags the map west to bring New Zealand clear.
  - Then the drag stops with Auckland's pin under the panel, at x ≈ 1161 at zoom 5 and ≈ 1042 at zoom 6. At zoom 3, everything east of about 111°E stays under the panel horizontally.
  - The cluster zoom's `setView` is clamped the same way, so a circle there stays under the panel too. Before `1091f4e`, any room could be dragged clear.
  - Zooming in to 7, Tab, or the narrow strip below the panel still reach it.
- **Rule:** FR-3, FR-7 (clear of the chat panel). This is a regression from REV-03's fix.
- **Fix:** draw markers on the copy of the world nearest the view's centre, and keep the map's wrapping. That was the report's first option for REV-03. Or leave room past the antimeridian for the panel.
- **Confidence:** high
- **Verdict:** CONFIRMED (1/1)

### REV-D02 [S2][correctness] Fanned-out pins take their slots by id, not by position, so a double-click beside a pin can open the older room
- **Where:** `src/client/features/map/useRoomMarkers.ts:14`, `:123-140`, `:176`; `src/client/features/map/fanOut.ts:13-19`; `src/client/features/map/clusterRooms.ts:33-35`, `:55`
- **Evidence:**
  - Slots are handed out in id order: `spot.rooms.forEach((room, index) => { const { x, y } = offsets[index] …`, where `spot.rooms` is sorted by id and index 0 is the leftmost slot.
  - `SAME_SPOT_PX = 24` fans out pins that merely touch.
  - The open room is fanned too.
  - The pin's click handler has no `detail > 1` check, unlike the map's.
- **Scenario:**
  - Given Chatroom 1's pin alone at the opening zoom.
  - When the user clicks the map 15 px left of its tip and 10 px above it.
  - Then Chatroom 2 opens, and the two pins, 18 px apart, fan out with room 1 in the left slot. Room 1's image now covers the point just clicked, and room 2's pin is drawn on the far side.
  - If the click was a double-click, and the create answered between its two clicks, the second click opens Chatroom 1. Before `e34ea66` it fell on the map, which ignores it.
- **Rule:** FR-2 (a double-click makes exactly one room, and it opens); REVIEW.md races (double clicks). This is a regression from REV-02's fix.
- **Fix:**
  - Order each spot's slots by screen position.
  - Fan out only pins that would hide one another, a few pixels apart.
  - Ignore `detail > 1` on pin clicks.
  - **Regression test:** an e2e test that clicks beside a pin and expects the new pin on the side that was clicked, and Chatroom 2 to stay open after a double-click.
- **Confidence:** high for the swapped slots; the double-click also needs the timing
- **Verdict:** CONFIRMED (1/1)

### REV-D03 [S3][correctness] `noWrap` without `bounds` makes Leaflet request tiles outside the world on screens wider than it
- **Where:** `src/client/features/map/tiles.ts:10-16`
- **Evidence:**
  - The tile layer has `noWrap: true` and no `bounds`.
  - `_isValidTile` (`GridLayer.js:726-730`) lets out-of-range columns through when the CRS has `wrapLng`, as Web Mercator has. With `_wrapX` off, they are requested as they are.
- **Scenario:**
  - Given a window 2,560 px wide.
  - When the map is at zoom 3, where the world is 2,048 px wide.
  - Then Leaflet requests columns -1 and 8, such as `tile.openstreetmap.org/3/-1/2.png`. These fail and log console errors, about a dozen per view. Users see only grey.
- **Rule:** PRD Risks (OSM's tiles: light usage); the project's rule of no console errors.
- **Fix:** `bounds: DRAWABLE_WORLD` on the tile layer, or the wrapping map of REV-D01's first option.
- **Confidence:** medium (OSM's exact answer not checked)
- **Verdict:** CONFIRMED (1/1)

### REV-D04 [S3][docs] The runbook's copy-paste release commands push a tag that never deploys
- **Where:** `infra/aws/RUNBOOK.md:296-297`; `.github/workflows/ci.yml:7`
- **Evidence:** `git tag -a vX.Y.Z -m "vX.Y.Z"` and `git push origin vX.Y.Z`, while CI triggers only on `tags: ['v[0-9]*']`.
- **Scenario:**
  - Given someone runs the block as written.
  - When git accepts and pushes `vX.Y.Z`.
  - Then no workflow starts, and the stray tag stays on GitHub.
- **Rule:** REVIEW.md Tests and docs (commands in the docs work). This is a regression from REV-13's fix.
- **Fix:** set the version once (`export VERSION=v1.2.3`), with a sentence saying to pick the next version, then tag and push `"$VERSION"`.
- **Confidence:** high
- **Verdict:** CONFIRMED (1/1)

### REV-D05 [S3][docs] A schema comment still describes the old map, and the README doesn't describe the new one
- **Where:** `src/shared/schemas.ts:6`; `README.md:11-13`
- **Evidence:**
  - The comment reads `/** A point on the map. Clients send wrapped longitudes, so both ranges are strict. */`, but `toRoomCoordinates` no longer wraps (`coordinates.ts:24`).
  - The README says nothing of the single world, or of pins at one spot fanning out.
- **Scenario:**
  - Given a reader checks how the map behaves at its edges or at one spot.
  - When they read the comment and the README.
  - Then the comment points at wrapping that was removed, and the README is silent.
- **Rule:** AGENTS.md, Definition of done, item 3.
- **Fix:** reword the comment and add a line to the README.
  - The verifier found that the PRD needs no change: both fixes restore what FR-2 and FR-3 already require.
- **Confidence:** high
- **Verdict:** CONFIRMED (1/1)

### REV-D06 [S3][tests] No test checks that a connection's socket slot is freed when its socket leaves
- **Where:** `src/server/realtime/socket-server.ts:131`; `src/server/realtime/socket-server.test.ts:444-456`
- **Evidence:** `socket.on('disconnect', () => withSocket.delete(socket.conn))`. The only test sends a burst of CONNECT packets and never a DISCONNECT.
- **Scenario:**
  - Given the release line is deleted.
  - When a raw client sends `41` and then `40` on the same WebSocket.
  - Then the second CONNECT is refused, and every test still passes. The app's own client always reconnects on a new connection, so it never takes this path.
- **Rule:** REVIEW.md Tests and docs ("which broken implementation would still pass?").
- **Fix:**
  1. Open the slot with `40`.
  2. Send `41`, then wait until a watcher hears `{ online: 1 }`. The server handles `41` on `process.nextTick`, so a `40` in the same TCP read would close the connection.
  3. Send `40`, and expect a second `40` and no `44`.
- **Confidence:** medium
- **Verdict:** CONFIRMED (1/1)

### REV-D07 [S3][tests] No test checks that a fanned-out pin goes back to its room's own place
- **Where:** `src/client/features/map/useRoomMarkers.ts:147-148`; `e2e/clusters.spec.ts:200-227`
- **Evidence:** `if (!pin.getLatLng().equals(at)) pin.setLatLng(at)`. Both new e2e tests stop at the zoom where the pins fan out.
- **Scenario:**
  - Given an open room and a neighbour about 1 km apart near 47°N 20°E, fanned out at zoom 5.
  - When the map zooms in to 11, where they're about 26 px apart.
  - Then a version without the reset leaves both pins at their old fanned places, and no test notices.
  - Zooming out and back in, as the finding first proposed, doesn't reach the reset.
- **Rule:** AGENTS.md Testing ("tests fail without the behaviour"); FR-3.
- **Fix:** an e2e test of that scenario that checks each pin's position against its room's point.
- **Confidence:** medium
- **Verdict:** CONFIRMED (1/1), with the scenario corrected by the verifier

### REV-D08 [S3][tests] The compose test checks one exact line, not every published database port
- **Where:** `scripts/compose.test.ts:8-9`
- **Evidence:** `toContain("- '127.0.0.1:${DB_PORT:-3307}:3306'")` and `not.toMatch(/- '\$\{DB_PORT/)`.
- **Scenario:**
  - Given someone adds `- '3308:3306'` to the db service.
  - When `pnpm verify` runs.
  - Then it passes, with MySQL published on every interface again.
- **Rule:** the REV-05 regression test asked for in report.md; REVIEW.md ("which broken implementation would still pass?").
- **Fix:** read the db service's `ports:` entries, and expect each one to start with `127.0.0.1:`.
- **Confidence:** medium
- **Verdict:** CONFIRMED (1/1)

### REV-D09 [S4][maintainability] The pin's size is written in more than one place
- **Where:** `src/client/features/map/pinIcon.ts:12`; `src/client/features/map/fanOut.ts:3-5`; `src/client/features/map/fanOut.test.ts:5`
- **Evidence:** `iconSize: [25, 41]`, then a comment with `COLUMN_PX = 30` and `ROW_PX = 46`, and a test copy, `const PIN = { width: 25, height: 41 }`.
- **Scenario:**
  - Given the pin icon grows.
  - When the gates run.
  - Then the unit test still passes against its own copy. The e2e overlap checks catch any icon wider than 30 px, though, so only a second row's spacing can slip through.
- **Rule:** REVIEW.md Maintainability (duplication).
- **Fix:** export the size from `pinIcon.ts`, and derive the spacing and the test's values from it.
- **Confidence:** medium
- **Verdict:** CONFIRMED (1/1), downgraded to S4: the e2e gate catches the realistic regression

## Appendix: refuted findings

None.

## Limits

- **Nothing was executed during the review.** The verdicts come from tracing the code, including Leaflet 1.9.4, socket.io 4.8.4 and zod 4.6.7.
- **The scope is the seven fix commits.** The rest of the code was read only where a fix touches it.
- **Not checked live:**
  - OSM's actual answer to an out-of-range tile;
  - screens wider than 2,048 px, which the e2e tests (1280×720) don't cover.
- **One verifier vote per finding,** as the process says for S2 and S3.
