# Second delta review report

- **Date and commit:** 2026-11-04, `ffa58b9`.
- **Scope:** the seven commits that answer [report-delta.md](report-delta.md), `7223555..ffa58b9`:
  - the map fixes for REV-D01, REV-D02 and REV-D03;
  - the tests for REV-D06, REV-D07 and REV-D08;
  - the documentation fixes for REV-D04 and REV-D05.

  REV-D09 was left as it is.
- **Reviewers:** Claude Opus 5.5 in Claude Code, all read-only: 4 lens agents, and 7 verifier agents, one per S2 or S3 finding.
- **Numbering:** findings here are REV-E01 onwards, after report.md's REV-01 to REV-13 and report-delta.md's REV-D01 to REV-D09.

## Verdict

The fixes hold for what they were meant to fix:
- **The map:** with rooms drawn on the copy of the world nearest the view's centre, far-east rooms can be dragged clear of the panel (REV-D01), and no out-of-range tile is requested (REV-D03).
- **The pins:** at one spot, pins now take their slots in on-screen order, and the second click of a double-click lands on the map (REV-D02).
- **The tests and docs:** the new tests for REV-D06 and REV-D07 fail without what they guard, and the README line is accurate.
- **Security:** the security lens found no new way for user text to reach the page or a request.

One regression remains, at S2:
- **REV-E01:** the copy nearest the centre is the one in view only while the world is at least as wide as the window. On a window wider than 2,048 px at zoom 3, such as a 1440p monitor at 100% scaling, the outer strips repeat the world without its pins, and a click there puts the pin a world away.

The four S3s are smaller:
- **REV-E03:** a room made just beside a fanned-out pin can cover it.
- **REV-E02 and REV-E05:** two regression tests guard only part of their fix.
- **REV-E04:** the runbook's release block deploys if pasted unedited.

The verifiers refuted two maintainability findings, REV-E06 and REV-E07. One S4, REV-E08, stays unverified.

| Severity | Confirmed | Plausible | Refuted | Not verified |
|---|---:|---:|---:|---:|
| S1 | 0 | 0 | 0 | |
| S2 | 1 | 0 | 0 | |
| S3 | 4 | 0 | 2 | |
| S4 | | | | 1 |

## Gates

| Gate | Result |
|---|---|
| `pnpm verify` | Passed: lint, format, types, licences, hidden characters (181 files), Vitest 539 tests in 37 files |
| `pnpm test:e2e` | Passed: 77 tests, in Chromium plus WebKit for the `@smoke` ones |

## Funnel

Raw 9 → deduplicated 8 → 7 verified: 5 confirmed, 0 plausible, 2 refuted, with 1 S4 not verified. The false-positive rate was 2 of 7.
- **The merge:** the tests and docs lens and the correctness lens both found that REV-D02's test never fans the pins out (REV-E02). The merge kept the higher severity, S2.
- **Kept apart:** REVIEW.md merges findings by overlapping lines. Five findings share lines in `useRoomMarkers.ts` but describe different problems, each with its own fix, so they stay apart:
  - REV-E01 (`:117-120`);
  - REV-E03 (`:13-17`, `:144-160`);
  - REV-E06, which spans most of the file;
  - REV-E07 (`:53-58`);
  - REV-E08 (`:13-17`).
- **One severity change:** the verifier brought REV-E02 down from S2 to S3.
- **One note, not counted:** the security lens also pointed out REV-E01's case, outside its own lens.

| Lens | Raw | Confirmed |
|---|---:|---:|
| Correctness | 3 (1 merged) | 2 |
| Security | 2 | 2 |
| Maintainability | 3 | 0 (2 refuted, 1 not verified) |
| Tests and docs | 1 | 1 |

## Per fix

| Fix | Holds | Regression |
|---|---|---|
| REV-D01 and REV-D03, rooms on the world copy in view (`09e9730`) | Yes, on windows up to 2,048 px wide | REV-E01 on wider windows at zoom 3 |
| REV-D02, fan out in screen order (`c060203`) | Yes | Its test never fans pins out (REV-E02); a fanned pin can cover a pin just outside its spot (REV-E03); REV-E08 |
| REV-D07, a fanned-out pin goes back (`4590281`) | Yes, and it fails without the reset | None |
| REV-D06, a connection's socket slot is freed (`c5f14f9`) | Yes, and it fails without the release on disconnect | None |
| REV-D08, every published database port (`4dee349`) | Yes, for plain entries | It misses an entry with a trailing comment, or after a blank line (REV-E05) |
| REV-D04, the release block's `VERSION` (`cdab42c`) | Yes: it no longer pushes a literal `vX.Y.Z` | Pasted unedited, it tags whatever is checked out as `v1.2.3`, which deploys (REV-E04) |
| REV-D05, the README's busy-areas line (`ffa58b9`) | Yes | None |

## Findings

### REV-E01 [S2][correctness] On a window wider than the world, the outer strips never show pins, and a click there puts its pin a world away
- **Where:** `src/client/features/map/useLeafletMap.ts:34-37`; `src/client/features/map/useRoomMarkers.ts:59`, `:117-120`; `src/client/features/map/coordinates.ts:14`; `src/client/features/map/tiles.ts:10-14`
- **Evidence:**
  - The map has `minZoom: 3`, no `maxBounds`, and tiles that repeat.
  - Each marker is drawn once, at `L.latLng(room.lat, room.lng + 360 * Math.round((centreLng - room.lng) / 360))`, so always within 180° of the view's centre.
  - The world is 2,048 px wide at zoom 3. A 2,560 px map at zoom 3 spans 225° either side of its centre, so the outer 256 px on each side repeat what is shown 2,048 px away.
- **Scenario:**
  - Given a 2,560 px wide window, such as a 1440p monitor at 100% scaling, zoomed out to zoom 3 around the opening centre (lng 20), so the view spans lng −205 to 245.
  - When the user clicks Auckland on the left-hand copy (lng −185.2, x ≈ 112).
  - Then Chatroom N opens and is stored at lng 174.76, but its pin is drawn on the right-hand copy, at x ≈ 2,160. The spot clicked stays empty.
  - The same goes for every room in the outer 256 px on either side: its pin shows only on the inner copy, and a click on the outer copy makes a room whose pin goes to the inner one.
  - Before `09e9730`, those strips were grey margins, where clicks were ignored.
- **Rule:** FR-2 (a map click adds a pin) and FR-3. On wide windows, this undoes REV-03's fix. Its e2e test runs at 1,280 px and checks only that the pin is in view, which a pin a world away from the click still passes on a 2,560 px window.
- **Fix:**
  - Keep the world at least as wide as the map, so no place appears twice and the copy nearest the centre is the one in view: `map.setMinZoom(Math.max(3, Math.ceil(Math.log2(width / 256))))` at mount and in the existing resize observer.
  - **Regression test (e2e, 2,600×900):** zoom out fully, click 60 px from the left edge, and expect the new pin's tip within a few pixels of the click. The tile test at the same size then runs at zoom 4.
- **Confidence:** high
- **Verdict:** CONFIRMED (1/1). The verifier adds that seeing Auckland from the opening centre needs a map about 1,100 px tall, as a 1440p screen gives; the click 60 px from the left edge doesn't need it.

### REV-E02 [S3][tests] REV-D02's regression test never makes the pins fan out, so it passes without the screen-order fix
- **Where:** `e2e/clusters.spec.ts:248-259`; `src/client/features/map/useRoomMarkers.ts:144-156`
- **Evidence:**
  - The test clicks 15 px left of the pin's tip and 10 px up: `page.mouse.click(first.x + 12 - 15, first.y + first.height - 10)`, about 18 px from the tip.
  - The same commits set `const SAME_SPOT_PX = 12`, and only pins closer than 12 px on screen fan out.
  - So neither pin moves, and `made.x < old.x` holds with each pin at its own place.
- **Scenario:**
  - Given the sort by screen position is taken out of `fannedPositions`, so slots go by id again: the REV-D02 bug.
  - When the gates run.
  - Then every test still passes. The other fan-out tests use rooms at one spot, or rooms already in id order from west to east (`e2e/clusters.spec.ts:228-231`).
  - With that bug, a room made about 8 px left of a pin's tip and 4 px below it, 9 px away, takes the right-hand slot, on the far side of the old pin.
- **Rule:** REVIEW.md Tests and docs ("which broken implementation would still pass?"); AGENTS.md Testing; the regression test REV-D02 asked for.
- **Fix:** click within 12 px of the tip and below it, clear of the pin's image, for example 6–8 px left and 4–6 px down. Check that the pins fan out, about 30 px apart, then that the new one is on the left. Break-check by removing the sort.
- **Confidence:** high
- **Verdict:** CONFIRMED (1/1), downgraded from S2 to S3. The code is right today, so the test hides no bug: it is a missing regression test, as REV-06 and REV-D06 to REV-D08 were. Against the code before `c060203`, the test fails, so it guards the threshold half of the fix. Only the sort goes unguarded. The verifier checked that the proposed test tells the two versions apart: the new pin lands 30 px left of the old one with the sort, and 30 px right without it.

### REV-E03 [S3][correctness] At the deepest zoom, a fanned-out pin can cover a pin just outside its spot
- **Where:** `src/client/features/map/useRoomMarkers.ts:13-17`, `:80`, `:144-160`; `src/client/features/map/fanOut.ts:4`, `:18`
- **Evidence:**
  - `const SAME_SPOT_PX = 12` decides which pins share a spot.
  - `fanOut(2)` moves two pins 15 px either side (`COLUMN_PX = 30`).
  - Pins outside a spot are drawn at their own place, `fanned.get(first.id) ?? shown(first, centreLng)`, and nothing checks them against the slots.
- **Scenario:**
  - Given rooms 1 and 2 at the very same spot S, shown at zoom 19 after a click on their "2 chatrooms" circle, so their pins stand 15 px either side of S.
  - When the user clicks 3 px below the tip of room 2's pin. The click misses both images, so it creates Chatroom 3, 15.3 px from S.
  - Then room 3 stays out of the spot, and its pin is drawn 3 px below room 2's. Room 3 is further south and open, so it covers all of room 2's image except a 3 px strip.
  - A click on room 2 now opens room 3, and the circle brings back the same layout. Room 2 can be reached only by Tab, a link or that strip, which is REV-02's failure again.
  - It's S3 because the clicks that cause it fall in a band a few pixels wide.
- **Rule:** FR-3 (a pin click opens that room); REV-02's fix; the contract at `useRoomMarkers.ts:27-28` ("so each one can be clicked").
- **Fix:**
  - Once a spot's pins are placed, any pin within `SAME_SPOT_PX` of one of its slots joins the spot. Repeat until no pin joins; the order by screen position keeps each pin on its own side.
  - **Regression test (e2e):** seed rooms 1 and 2 at one spot, and room 3 15 px east and 3 px south of it at zoom 19. Click "3 chatrooms", then click each pin and expect its heading.
- **Confidence:** high
- **Verdict:** CONFIRMED (1/1), at S3. Once room 3 exists, every viewer meets the problem, but making it takes a click a few pixels below a fanned pin's tip, at the deepest zoom only. The spot is measured between rooms' real positions, not the slots their pins are drawn at, so the join-by-slot fix is the general one: with three or more rooms, the outer slots are at least 30 px out. A room posted to the API at a slot's exact position hides the pin entirely.

### REV-E04 [S3][security] The release block deploys when pasted unedited, and it tags whatever is checked out
- **Where:** `infra/aws/RUNBOOK.md:293-299`; `.github/workflows/ci.yml:7`, `:133`
- **Evidence:**
  ```bash
  export VERSION=v1.2.3                   # the next version
  git tag -a "$VERSION" -m "$VERSION"
  git push origin "$VERSION"
  ```
  - CI runs on `tags: ['v[0-9]*']`, and the deploy job runs when `startsWith(github.ref, 'refs/tags/v')`.
  - The repository's tags are `v1.0.0` and `v1.1.0`, so `v1.2.3` is free.
- **Scenario:**
  - Given a checkout on a local branch, or on `main` with commits not yet pushed.
  - When a person pastes the block without editing its first line.
  - Then git tags that commit as `v1.2.3` and pushes the tag with its commits. Once the checks pass, the demo runs code that never reached `main`, under a version that skips numbers, with no approval step.
  - Before `cdab42c`, the same paste pushed `vX.Y.Z`, which CI ignores. Tagging HEAD is older; the deployable default is new.
- **Rule:** AGENTS.md Git ("a person tags a commit on `main`"); AGENTS.md Cloud safety (a version tag deploys the demo); `RUNBOOK.md:301` ("a tag deploys with no approval step").
- **Fix:**
  - An empty `VERSION=` with a comment, then `git fetch origin main && git tag -a "$VERSION" -m "$VERSION" origin/main && git push origin "refs/tags/$VERSION"`. An unedited paste then stops at `fatal: '' is not a valid tag name`, and nothing is pushed.
  - **Regression test** in `scripts/runbook.test.ts`: the release block's `VERSION=` has no value, and its `git tag` names `origin/main`.
- **Confidence:** high
- **Verdict:** CONFIRMED (1/1), at S3: a documentation slip, since only a person with push rights can make it, and re-running the previous tag's deploy rolls it back. On an up-to-date `main`, an unedited paste deploys the intended commit, and only the number is wrong. The verifier checked the fix: with an empty `VERSION`, `git tag` fails and the `&&` stops the push.

### REV-E05 [S3][security] The compose check misses a database port with a trailing comment, or one after a blank line
- **Where:** `scripts/compose.test.ts:7-13`; `compose.yaml:26-29`
- **Evidence:**
  ```ts
  const list = /\n {4}ports:\n((?: {6}.*\n)+)/.exec(block)?.[1] ?? ''
  return [...list.matchAll(/^ {6}- ['"]?([^'"\n]+?)['"]?$/gm)].map(([, port]) => port ?? '')
  ```
  - The entry pattern needs the closing quote to end the line.
  - The list stops at the first line without six leading spaces, such as a blank line.
- **Scenario:**
  - Given the db service's ports gain `      - '3308:3306' # for a GUI client` under the existing entry.
  - When the test reads them.
  - Then it sees only `127.0.0.1:${DB_PORT:-3307}:3306` and passes, while `docker compose up` publishes MySQL, with the root password `root`, on every interface at port 3308.
  - The same happens when the extra entry follows a blank line. Both are valid YAML that Prettier keeps.
- **Rule:** the aim of REV-D08's fix, which guards REV-05; REVIEW.md ("which broken implementation would still pass?").
- **Fix:** read every line after `ports:` until the next line indented four spaces or fewer. Skip blank and comment lines, strip a trailing ` # …`, and return every other line as an entry, so anything unexpected fails. Add fixtures for a trailing comment and a blank line.
- **Confidence:** high
- **Verdict:** CONFIRMED (1/1), at S3: a test gap, since `compose.yaml` binds MySQL to 127.0.0.1 today. Only a quoted extra entry slips through, as the file's own entries are; an unquoted one, or a comment on the existing entry, fails the test. The flaw is that lines it can't read are dropped instead of reported.

### REV-E08 [S4][maintainability] `SAME_SPOT_PX`'s reason hard-codes the pin's width
- **Where:** `src/client/features/map/useRoomMarkers.ts:13-17`
- **Evidence:** the comment "A pin is 25 px wide: pins further apart each keep more than half of it in view, and stay", then `const SAME_SPOT_PX = 12`.
- **Scenario:** Given the pin icon in `pinIcon.ts` is resized. When nobody updates 12. Then the threshold no longer matches the "more than half in view" rule it states, and nothing flags it.
- **Rule:** REVIEW.md Maintainability (comments explain why, and the code matches them).
- **Fix:** derive it from the icon's size, or name the dependency in `pinIcon.ts`. This is the same duplication as REV-D09.
- **Confidence:** medium
- **Verdict:** not verified (S4)

## Appendix: refuted findings

### REV-E06 [S3][maintainability] The world-copy rule is passed around and repeated in several projections
- **Where:** `src/client/features/map/useRoomMarkers.ts:59`, `:71-76`, `:117-131`, `:137-155`, `:244-246`
- **Claim:** `shown(room, centreLng)` and `centreLng` are passed through `groupsAt`, `fannedPositions`, `sync` and `zoomTo`. A later change to the world-copy rule made in only some of those places would group rooms on one copy and draw them on another. The fan-out also projects each room twice.
- **Verdict:** REFUTED (1/1).
  - **One definition:** the rule is defined once, in `shown` (`:117-120`). The other sites only call it, so a change to it reaches them all, and a change to its parameters fails type-checking at each call.
  - **One copy per pass:** each `sync` reads the centre once (`:59`) and hands the same value to the grouping, the fan-out and the drawing. So one pass can't group on one copy and draw on another.
  - **The fix wouldn't help:** `zoomTo`'s second read runs later, from a click or Enter, so the proposed `place` closure inside `sync` couldn't reach it.
  - **What remains is an S4 nit:** the fan-out's sort projects rooms that its grouping already projected.

### REV-E07 [S3][maintainability] `moveend` has an anonymous listener, and every zoom syncs twice
- **Where:** `src/client/features/map/useRoomMarkers.ts:53-58`
- **Claim:** `zoomend` and `moveend` both run `sync()`, so every zoom does the whole pass twice. Work added later to either listener, such as the focus hand-off, would run on both events in an order that is hard to follow. The fix proposed keeping only `moveend` and moving the focus hand-off there.
- **Verdict:** REFUTED (1/1). Every zoom does run `sync()` twice, but nothing fails.
  - **`sync()` already runs often:** it is an idempotent update that the store watcher also runs on every change to the rooms or the selection.
  - **The order is fixed:** the focus hand-off runs only on `zoomend`, and Leaflet fires `zoomend`, then `moveend`, synchronously.
  - **The events differ:** `setView` first stops a running pan, which fires `moveend` before the zoom starts. Leaflet starts such a pan when Tab reaches a circle at the edge of the view. Moving the hand-off to `moveend` would then focus a circle that the zoom is about to remove, and focus would drop to the page: the bug the hand-off exists to prevent.
  - **The scenario has no failure:** a second pass that changes nothing, which REVIEW.md doesn't count as a finding.
  - **What remains:** the verifier suggests a comment at `useRoomMarkers.ts:54` saying why the hand-off waits for `zoomend`.

## Limits

- **Nothing was executed during the review.** The verdicts come from tracing the code, including Leaflet 1.9.4.
- **The scope is the seven commits.** The rest of the code was read only where they touch it.
- **Not checked live:** windows wider than 2,048 px. REV-E01 comes from the projection maths; the e2e test at 2,600 px checks only the tile requests.
- **One verifier vote per finding,** as the process says for S2 and S3.
