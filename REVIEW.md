# Code review guide

How Hello World is reviewed, whether by people, by AI agents, or both. In Claude Code, `/self-review` runs this process. Any other tool can follow it by hand, using this file as the prompt.

## Process

1. **Gates first.** Run `pnpm verify` and `pnpm test:e2e`.
   - A failing gate is an S1 finding on its own.
   - Reviewers don't repeat what the gates already check.
2. **Four lenses in parallel.** One independent reviewer per lens: correctness, security, maintainability, and tests and docs. Each reviewer sees only the code, this guide and the gate results.
3. **Deduplicate.** When findings share a file and overlapping lines (±3), keep one, at the higher severity. Number the survivors REV-01, REV-02 and so on.
4. **Verify adversarially.** A separate skeptic tries to refute each finding:
   - S1: three independent votes, majority wins;
   - S2 and S3: one vote;
   - S4: not verified.
5. **Report.** Commit `docs/review/report.md`, built from the template below, exactly as generated.
6. **Triage by a human.** Record a decision for every finding in `docs/review/triage.md`: fix, won't fix or defer, each with its reason.
7. **Fix and re-review.**
   - Fix one finding per commit, writing the regression test first.
   - Review the fix commits again and save the result as `docs/review/report-delta.md`.
   - After that, only documentation may change.

## Severity

| Level | Meaning | Policy |
|---|---|---|
| S1 Blocker | Breaks a functional requirement, loses or corrupts data, is exploitable, crashes the app, or makes a gate fail | Fix before release |
| S2 Major | Wrong behaviour in a realistic edge case, a plausible abuse path, or a test that hides a bug | Fix, or justify and mitigate |
| S3 Minor | Slows down the next change: unclear code, a missing non-critical test, a documentation slip | Fix if it takes under 30 minutes, otherwise defer |
| S4 Nit | A matter of taste | At most five per review; never blocks |

## Evidence rule

Report a finding only with all four of these:
- **Location:** `file:line`, or a line range.
- **Code:** the lines involved, quoted.
- **Failure scenario:** Given … When … Then …, concrete enough to turn into a test.
- **Confidence:** high, medium or low. Drop low-confidence S3 and S4 findings.

"Consider …" advice with no failure scenario is not a finding.

## Do not report

- Formatting, lint or type errors. Prettier, ESLint and vue-tsc own those.
- Anything the PRD puts out of scope, such as authentication or moderation.
- Generated or third-party code: `node_modules`, `dist`, lockfiles.
- Preferences that contradict `AGENTS.md` or a PRD decision. Challenge the decision in the report's verdict instead.

## Lens checklists

**Correctness**
- Every requirement (FR-1 to FR-6 in `docs/PRD.md`) behaves as its acceptance line says.
- The invariants I1–I7 hold, including on error and reconnect paths.
- No races, such as:
  - double clicks;
  - events that arrive before the initial load;
  - concurrent sends;
  - out-of-order updates.
- Resources are cleaned up: listeners, timers, sockets, Leaflet maps, database connections.
- Every promise is awaited or handled, and status codes match the API contract.

**Security**
- The shared zod schemas validate every external input: HTTP bodies, params and queries; socket payloads; environment variables.
- User text renders as plain text only (I7). SQL goes only through Kysely or parameterised `sql` templates.
- Rate limits, body limits and socket message limits are in place.
- **Headers:** CSP and Referrer-Policy are set, and HTTPS-only headers appear only behind HTTPS.
- **Secrets:** none in the repo, images, logs or `VITE_*` variables.
- **Infrastructure:**
  - least-privilege IAM and IMDSv2;
  - a private, encrypted database, reached over TLS.
- **Supply chain:**
  - dependency versions pinned, with install scripts blocked;
  - GitHub Actions pinned to commit SHAs.

**Maintainability**
- The structure follows `AGENTS.md`:
  - layering (routes → repositories and `Broadcaster`);
  - feature folders;
  - naming.
- The code reads clearly:
  - names say what things are;
  - each function does one thing;
  - there is no dead or commented-out code.
- Comments explain why, not what.
- Logic is not duplicated between client and server; shared schemas live in `src/shared`.
- The code still matches the PRD's decisions.

**Tests and docs**
- Every requirement is tested at the right level, and the test fails when the behaviour breaks. Ask: "which broken implementation would still pass?"
- Negative paths are covered: 400, 404, 429, duplicate sends, reconnects.
- Tests have no sleeps, no order dependence and no shared state.
- README commands work in PowerShell and bash. Ports, versions and paths in the docs match the code.
- The infrastructure cost table adds up.
- Texts, layout and behaviour match the mockups; any deviation is documented.
- Accessibility: labels, keyboard access, a live region, focus handling.

## Finding format

```markdown
### REV-nn [S2][correctness] Short title
- **Where:** `src/server/messages/messages.routes.ts:42-48`
- **Evidence:** the quoted code
- **Scenario:** Given … When … Then …
- **Rule:** the invariant, AGENTS.md section or FR it breaks
- **Fix:** what to change, and the regression test that proves it
- **Confidence:** high | medium | low
- **Verdict:** CONFIRMED (3/3) | PLAUSIBLE (1/1) | REFUTED, added by the verifier
```

**Verdicts:**
- **CONFIRMED:** the verifier traced the problem in the code or reproduced it.
- **PLAUSIBLE:** the verifier neither confirmed nor refuted it.
- **REFUTED:** the verifier showed it is wrong. It moves to the appendix, with the reason.

## Report template: `docs/review/report.md`

```markdown
# Review report

- **Date and commit:** … **Scope:** … **Reviewers:** models and number of agents

## Verdict
One paragraph, then the number of findings per severity.

## Gates
| Gate | Result |

## Funnel
Raw → deduplicated → confirmed / plausible / refuted, with the false-positive rate.

## Findings
Most severe first, in the finding format.

## Appendix: refuted findings

## Limits
What this review did not cover.
```

## Triage note: `docs/review/triage.md`

Start with five to eight sentences on what was fixed, what was not, and why. Then add a table:

| ID | Severity | Decision | Commit or reason | Prevention |
|---|---|---|---|---|

A finding may go unfixed only for one of these reasons:
- a false positive;
- by design, citing the PRD decision;
- out of scope;
- the cost exceeds the value, with a mitigation.
