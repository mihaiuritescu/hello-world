# AI setup

How this project uses AI coding tools, and how to reproduce it. The rules themselves live in [AGENTS.md](../AGENTS.md); this page explains the setup around them.

## Principles

- **One tool-agnostic source of truth.** `AGENTS.md` holds the commands, architecture rules, conventions and definition of done. `CLAUDE.md` imports it, with the PRD, and adds only Claude Code's workflow. Any other tool can read `AGENTS.md` as it is.
- **Plans before code.** Every multi-file change starts as a plan that names its files, its tests and the requirement it serves. A person approves the plan.
- **Evidence over claims.** "Done" means pasted command output, such as `pnpm verify` and `pnpm test:e2e`.
- **No self-approval.** Separate, read-only reviewer agents check the code, never the session that wrote it.
- **People own the cloud.** AI tools write the AWS runbook, and a person runs it with Claude Code closed.

## The files

| File | What it does |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | Commands, repository map, architecture rules, conventions, database, testing, security, dependency and cloud-safety rules, slices and definition of done |
| [`CLAUDE.md`](../CLAUDE.md) | Imports `AGENTS.md` and the PRD, then sets the working loop and the Windows gotchas |
| [`.claude/rules/`](../.claude/rules) | Rules scoped by path, loaded for matching files: client (Vue, Vuetify, Leaflet), server (Node, Fastify, MySQL), tests, and infrastructure |
| [`.claude/settings.json`](../.claude/settings.json) | Permissions. **Allowed:** tests, lint, `docker compose up` and git. **Asked first:** new packages and `docker compose down`. **Denied:** reading `.env`, force-pushes, `git reset --hard`, every `aws` and `gh` command, and `~/.aws` |
| [`.claude/hooks/format-file.mjs`](../.claude/hooks/format-file.mjs) | After every edit, runs Prettier and ESLint's fixes on the file, and reports what ESLint can't fix |
| [`.claude/hooks/stop-gate.mjs`](../.claude/hooks/stop-gate.mjs) | Before a turn ends, type-checks and lints the changed files. On failure it blocks once, then only warns |
| [`scripts/git-guard.ts`](../scripts/git-guard.ts) | Before every shell command, blocks force-pushes and branch deletions, `git reset --hard`, `git clean`, `git -c`, `git config` writes and `--no-index`, wherever their flags sit. Permission rules only match the start of a command, so they can't do this alone |
| [`.claude/skills/`](../.claude/skills) | `/slice` builds a slice test-first, ending in a verified commit. `/add-dependency` challenges a new package, checks it, pins it and commits it alone. `/self-review` runs the review |
| [`.claude/agents/`](../.claude/agents) | Four read-only lens reviewers (correctness, security, maintainability, tests and docs) and an adversarial verifier |
| [`REVIEW.md`](../REVIEW.md) | The review guide: severity scale, evidence rule, checklists, report and triage templates |

## The working loop

1. **Plan.** `/slice S4` reads the slice and its requirements, then writes an acceptance checklist and a plan: files, tests, invariants. A person approves it in plan mode.
2. **Tests first.** New tests run, and fail for the expected reason, before any code exists.
3. **Implement.** The hooks format every edit, and the stop gate type-checks every turn.
4. **Prove.** `pnpm verify` runs lint, format, types, licences, hidden characters, and the unit and integration tests. `pnpm test:e2e` covers anything a user sees.
5. **Review.** The correctness and security reviewers read the change. Fixes come test-first, then a delta review checks them.
6. **Commit.** Small Conventional Commits, each passing `pnpm verify`. A person pushes.

## What people decide

- **Product and stack:** Vue, Pinia and Vuetify; MySQL on RDS; one EC2 instance; free packages only.
- **Approvals:** every plan and new package. Git runs without prompts, but a push happens only when a person asks for it.
- **AWS:** every command. Claude writes the runbook, and a person runs it with no AI session open while signed in.
- **Reviews:** what to fix and what to defer, recorded in the triage note.

## Reproducing it

- **Claude Code:** open the repository, then run `/slice <id>` for the next slice, or `/self-review`.
- **Another tool:** give it `AGENTS.md` as its instructions, plus `REVIEW.md` for a review.

This project was built with Claude Code in the Claude desktop app, using Claude Opus 5.5.

## Calibration: what the reviews caught

| Slice | Finding | What followed |
|---|---|---|
| S2 | Invisible bidirectional characters, decoded from escapes by a tool, had reached the source | The characters became escapes; `pnpm check:text` (S4) now fails on any raw one |
| S3 | A forced reconnect skipped the backoff: a retry storm under load | Replaced by a reload when a subscription's answer comes late |
| S3 | Socket handshakes bypass the HTTP rate limits | Connection and subscription caps (S4) |
| S5 | 18 findings over three rounds: runbook safety, rollbacks, first boot, the deploy's trust chain | 16 fixed; 1 refuted with a test (a carriage return in Git Bash captures); 1 kept and documented (AWS's managed SSM policy) |
