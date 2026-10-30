---
name: slice
description: Implement one delivery slice (S1–S6) or functional requirement (FR-n) end to end, test-first, ending in a verified Conventional Commit. Use when asked to build a slice or requirement from docs/PRD.md.
argument-hint: <slice or FR id, e.g. S1 or FR-4>
---

# Implement a slice

Work through these steps in order and show evidence at each one.

1. **Understand.** Read the slice in `AGENTS.md` and its requirements in `docs/PRD.md`. Write an acceptance checklist with one line per observable behaviour, taken from the FR acceptance text.
2. **Plan.** List:
   - the files to add or change;
   - the tests for each level (unit, integration, end-to-end);
   - the invariants involved (I1–I7).

   In plan mode, stop here until the plan is approved.
3. **Write failing tests first.** Run them, and confirm they fail for the expected reason, not because of a typo or missing setup.
4. **Implement** the smallest change that makes them pass. Follow `AGENTS.md` and the path-scoped rules in `.claude/rules/`.
5. **Prove it.**
   - Run `pnpm verify`.
   - For user-visible changes, also run `pnpm test:e2e`.
   - Paste the commands and their results.
   - Check every line of the acceptance checklist.
6. **Update the docs.**
   - README: when setup, scripts or behaviour changed.
   - PRD: only when a decision changed. Add a revision note; never rewrite history.
7. **Commit.**
   - Subject: `type(scope): summary` in Conventional Commits.
   - Body: why the change was made.
   - Footer: `Refs: FR-n`.
   - One slice can be several small commits, each of which passes `pnpm verify`.
