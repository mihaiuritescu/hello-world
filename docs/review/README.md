# Self-review

How this project reviews its own code, and where the results live.

## The configuration

| File | Role |
|---|---|
| [`REVIEW.md`](../../REVIEW.md) | The review guide: process, severity scale, evidence rule, lens checklists, report and triage templates |
| [`.claude/skills/self-review/SKILL.md`](../../.claude/skills/self-review/SKILL.md) | `/self-review`: runs the process in Claude Code |
| [`.claude/agents/review-*.md`](../../.claude/agents/) | Four read-only lens reviewers (correctness, security, maintainability, tests and docs), plus an adversarial verifier |

## How it works

1. **Deterministic gates** run first: lint, format, types, licences, unit, integration and end-to-end tests.
2. **Four reviewers** then work in parallel, one per lens. Each sees only the code and `REVIEW.md`, and each finding must cite `file:line` with a concrete failure scenario.
3. **A skeptic** tries to refute every finding before it reaches the report (three votes for blockers). This removes plausible-sounding false positives.
4. **A person triages** the report and decides what to fix and why. Fixes come test-first, and a delta review covers the fix commits.

## Running it

- **In Claude Code:** `/self-review`, or `/self-review <git range>` for part of the history.
- **With another tool:** give it `REVIEW.md` as the prompt and run one review per lens by hand.

## Results

| File | Content |
|---|---|
| `report.md` | The review of the release candidate, committed exactly as generated |
| `triage.md` | The human decision on each finding: fixed, won't fix or deferred, with the reason |
| `report-delta.md` | The review of the fix commits |
