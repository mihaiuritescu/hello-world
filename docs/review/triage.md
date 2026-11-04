# Triage note

What the self-review fixed, what it left, and why. Mihai Uritescu decided each finding, and the note was written with Claude Code from those decisions. It covers three rounds:
- [report.md](report.md): the release candidate, `bb23f6b`;
- [report-delta.md](report-delta.md): the fixes for it;
- [report-delta-2.md](report-delta-2.md): the fixes for the delta review.

## Summary

Three rounds of review raised 30 findings and no blocker: the verifiers confirmed 22 and refuted 5, and 3 S4s went unverified. Every S2 of the first two rounds was fixed test-first, one commit each: one connection opening many sockets (REV-01), pins that sat on one another or on the wrong copy of the world (REV-02, REV-03), and the two map regressions those fixes brought (REV-D01, REV-D02). Most S3s were fixed the same way, among them a local MySQL port open to the network (REV-05) and a release command that could deploy unpushed code (REV-E04). The map took three rounds, because each fix at the edges of the world exposed a narrower case. The last one, REV-E01, shows only on windows wider than 2,048 px at the lowest zoom, and it is the one S2 left: REVIEW.md allows only documentation after the delta review, and its fix would reach the release unreviewed. It is deferred, with its fix written out in the report and a line in the README's limitations. The other deferrals are S3s whose fix takes over 30 minutes, test gaps where the code is correct today, and one S4 of taste. After the second delta review, only the release block changed, with a test that reads it, because the release itself depends on it.

## The release candidate: [report.md](report.md)

| ID | Severity | Decision | Commit or reason | Prevention |
|---|---|---|---|---|
| REV-01 | S2 | Fix | `7a11a60`: one socket per connection | A raw-socket test: ten CONNECT packets on one connection open one socket, and its slot is freed when it leaves (REV-D06) |
| REV-02 | S2 | Fix | `e34ea66`, then `c060203` (REV-D02): pins at one spot fan out at the deepest zoom | An e2e test: each pin at one spot opens its own room |
| REV-03 | S2 | Fix | `1091f4e`, reworked in `09e9730` (REV-D01): each room is drawn on the copy of the world in view | An e2e test: a click by the map's eastern edge puts the pin in view. Windows wider than 2,048 px: REV-E01 |
| REV-04 | S3 | Defer | The cost exceeds the value: the fix needs a focus hand-off across every regroup, and a two-window test, about 45 minutes. **Mitigation:** focus is lost only when another window changes the focused group at that moment, and Tab finds the pin again | The fix's two-window keyboard test |
| REV-05 | S3 | Fix | `7b12138`: MySQL is published on 127.0.0.1 only | `scripts/compose.test.ts` (REV-D08), whose gaps are REV-E05 |
| REV-06 | S3 | Defer | The cost exceeds the value: the test needs a driver that counts open transactions, about an hour. **Mitigation:** the code is correct, the routes broadcast only after the repository's write returns, and tests already catch a broadcast before the write or after a refused one | That test, when the write path next changes |
| REV-07 | S3 | Won't fix | A false positive: the files it missed were this review's own outputs | |
| REV-08 | S3 | Fix | `d2a4254`: the stale note is gone | |
| REV-09 | S3 | Fix | `4c3d977`: client and server read room ids with one shared parser | `roomId.test.ts`, and the client's cases in `session.test.ts` |
| REV-10 | S3 | Won't fix | A false positive: the two stores keep stale loads apart in different ways, by design | |
| REV-11 | S3 | Won't fix | A false positive: the reviewer quoted the PRD from before its wording trim | |
| REV-12 | S4 | Defer | A matter of taste: one helper beside `isRateLimited`, when a limit's window next changes | |
| REV-13 | S4 | Fix | `4194891`, then `cdab42c` and `3f800e6`: the tag examples no longer name a tag that exists | `scripts/runbook.test.ts` checks the release block |

## The fixes: [report-delta.md](report-delta.md)

| ID | Severity | Decision | Commit or reason | Prevention |
|---|---|---|---|---|
| REV-D01 | S2 | Fix | `09e9730`: rooms are drawn on the copy of the world nearest the view's centre, and the map has no bounds | An e2e test: a room in Tokyo can be dragged clear of a tall panel |
| REV-D02 | S2 | Fix | `c060203`: only pins closer than 12 px fan out, in their on-screen order | An e2e test: a room made beside a pin keeps to its side. It doesn't make the pins fan out (REV-E02) |
| REV-D03 | S3 | Fix | `09e9730`: the tiles wrap again | An e2e test: on a 2,600 px screen, every tile requested is in the world |
| REV-D04 | S3 | Fix | `cdab42c`, then `3f800e6` (REV-E04) | `scripts/runbook.test.ts` checks the release block |
| REV-D05 | S3 | Fix | `ffa58b9`: the README says how pins at one spot behave. With wrapping back, the schema comment is true again | |
| REV-D06 | S3 | Fix | `c5f14f9`: the missing test | |
| REV-D07 | S3 | Fix | `4590281`: the missing test | |
| REV-D08 | S3 | Fix | `4dee349`: the test reads every published database port | Its gaps are REV-E05 |
| REV-D09 | S4 | Won't fix | The cost exceeds the value: the e2e overlap checks catch a pin that grows | |

## The fixes for the delta review: [report-delta-2.md](report-delta-2.md)

| ID | Severity | Decision | Commit or reason | Prevention |
|---|---|---|---|---|
| REV-E01 | S2 | Defer | The cost exceeds the value before the release: the fix changes the map's zoom limits, and REVIEW.md allows only documentation after the delta review. **Mitigation:** it needs a window wider than 2,048 px at the lowest zoom, and every closer zoom is right. The README lists it under Limitations, and the report gives the fix | The fix's e2e test: on a 2,600 px window, zoomed out fully, a click 60 px from the edge puts the pin under the pointer |
| REV-E02 | S3 | Defer | The cost exceeds the value before the release. **Mitigation:** the code is correct today, and the test still guards the threshold half of REV-D02's fix | A click within 12 px of the pin's tip, which checks that the pins fan out |
| REV-E03 | S3 | Defer | The cost exceeds the value: the fix changes how pins join a spot, about an hour. **Mitigation:** it takes a click in a band a few pixels wide at the deepest zoom, and Tab, a link or the covered pin's top strip still open the room | An e2e test with a third room seeded beside a fanned-out pin |
| REV-E04 | S3 | Fix | `3f800e6`: the version is empty until filled in, and the tag goes on `main` as fetched from GitHub | `scripts/runbook.test.ts` checks both |
| REV-E05 | S3 | Defer | The cost exceeds the value before the release. **Mitigation:** `compose.yaml` binds MySQL to 127.0.0.1 today, and the test catches a plain extra entry; only a quoted one with a trailing comment, or one after a blank line, slips through | A parser that fails on any line it can't read |
| REV-E06 | S3 | Won't fix | A false positive: the world-copy rule has one definition, and each pass uses one centre | |
| REV-E07 | S3 | Won't fix | A false positive: the two zoom events differ, and the proposed fix would lose keyboard focus | |
| REV-E08 | S4 | Won't fix | A matter of taste, like REV-D09. When the pin icon next changes, derive the spacing and the threshold from its size | |

## Open items from earlier slices

The reviews of earlier slices left these; the slice is in brackets. Each is documented where it applies.
- **A send that fails after you switch rooms** (S2): its draft and its error stay with that room, and show only when you reopen it. Nothing says so elsewhere in the app.
- **AWS's managed SSM policy** (S5): the instance role uses `AmazonSSMManagedInstanceCore`, which can also read any SSM parameter in the account, so the demo account keeps no secrets in Parameter Store ([INFRASTRUCTURE.md](../INFRASTRUCTURE.md#what-the-demo-stack-creates)). A narrower policy needs an AWS session to test.
- **The demo's limits** (S5): the app uses the database's master user, and the host doesn't install OS updates by itself ([INFRASTRUCTURE.md](../INFRASTRUCTURE.md#what-the-demo-stack-creates)). After teardown, the demo's nip.io address may reach someone else's server ([the runbook](../../infra/aws/RUNBOOK.md#teardown-about-10-minutes)).
- **Tag deploys** (S5):
  - no required reviewer, because deploys were chosen to be automatic;
  - no provenance attestation for the image;
  - the deploy role changes when the stack is created again;
  - no check that a tag is the newest, so tags go one at a time;
  - no test of `ci-deploy.sh` outside CI.
- **Small screens** (S7 and the phone fixes):
  - on a landscape phone 437–623 px wide with a tall panel, a circle's zoom ignores the panel;
  - on a 390×844 phone, it ignores the panel once the panel is taller than about 449 px;
  - in a card too short for its header and composer, the message list shrinks to nothing.
- **For the repository's owner:** GitHub's force-push protection on `main`, and Dependabot for the digest-pinned Node and Caddy images. Agents never run `gh`, so a person turns these on.
