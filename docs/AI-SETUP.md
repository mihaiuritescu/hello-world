# AI setup

How this project uses AI coding tools, and how to reproduce it. The rules themselves live in [AGENTS.md](../AGENTS.md); this page explains the setup around them.

## Principles

- **One tool-agnostic source of truth.** `AGENTS.md` holds the commands, architecture rules, conventions and definition of done. `CLAUDE.md` imports it, with the PRD, and adds only Claude Code's workflow. Any other tool can read `AGENTS.md` as it is.
- **Plans before code.** Every multi-file change starts as a plan that names its files, its tests and the requirement it serves. A person approves the plan.
- **Evidence over claims.** "Done" means pasted command output, such as `pnpm verify` and `pnpm test:e2e`.
- **No self-approval.** Separate, read-only reviewer agents check the code, never the session that wrote it.
- **People own the cloud.** AI tools write the AWS runbook, and a person runs it with Claude Code closed. A version tag deploys a release with no approval step, so only people push tags. The git guard catches an agent's tag push by mistake, but can't stop one made on purpose.

## The files

| File | What it does |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | Commands, repository map, architecture rules, conventions, database, testing, security, dependency and cloud-safety rules, slices and definition of done |
| [`CLAUDE.md`](../CLAUDE.md) | Imports `AGENTS.md` and the PRD, then sets the working loop and the Windows gotchas |
| [`.claude/rules/`](../.claude/rules) | Rules scoped by path, loaded for matching files: client (Vue, Vuetify, Leaflet), server (Node, Fastify, MySQL), tests, and infrastructure |
| [`.claude/settings.json`](../.claude/settings.json) | Permissions. **Allowed:** tests, lint, `docker compose up`, and everyday git: status, diff, log, show, add, commit, push, stash and the plumbing for split commits. **Asked first:** new packages, `docker compose down` and any other git command. **Denied:** reading `.env` and `~/.aws` with Claude's file tools, force-pushes and `git reset --hard` written plainly, and every `aws` and `gh` command |
| [`.claude/hooks/format-file.mjs`](../.claude/hooks/format-file.mjs) | After every edit, runs Prettier and ESLint's fixes on the file, and reports what ESLint can't fix |
| [`.claude/hooks/stop-gate.mjs`](../.claude/hooks/stop-gate.mjs) | Before a turn ends, type-checks and lints the changed files. On failure it blocks once, then only warns |
| [`scripts/git-guard.ts`](../scripts/git-guard.ts) | Before every shell command, blocks force-pushes, branch deletions and tag pushes (a version tag deploys the demo), `git reset --hard`, `git clean`, `git add --force`, `git -c`, `git config` writes, and every git option that runs another program. It catches them however the flags are spelled: anywhere in the command, abbreviated or escaped. Permission rules only match the start of a command, so they can't do this alone. It's a safety net, not a sandbox |
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
- **Approvals:** every plan, every new package and any unusual git command. Everyday git runs without prompts, but a push happens only when a person asks for it.
- **AWS:** every command. Claude writes the runbook, and a person runs it with no AI session open while signed in.
- **Releases:** pushing a version tag, which deploys the demo with no approval step. The git guard blocks Claude's tag pushes as a safety net. Only a required reviewer in GitHub would hold against an agent set on deploying, and automatic deploys were chosen instead.
- **GitHub:** the protection of `main` against force-pushes, the guard that nothing on this machine can talk around. Only the owner can turn it on.
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
| S5 | Tag deploys: 10 findings from two lenses. Later, the fix for GitHub's new token subject used wildcards, and a review caught that IAM's `*` let them match other repositories | All fixed or justified. The trust spells out the repository's names and IDs, and a test refuses a wildcard before the tag |
| S7 | 12 findings on the extras (1 S2, 11 S3), among them a circle click that could leave rooms merged or under the panel | Every confirmed one fixed, each with a regression test |
| S6 | Three rounds, 30 findings: 22 confirmed, 5 refuted. Two of the map fixes brought regressions, which the next round caught | 16 fixed, 7 deferred and 2 S4s left as they are, each with its reason in the [triage note](review/triage.md) |
