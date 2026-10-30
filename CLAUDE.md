@AGENTS.md
@docs/PRD.md

# Working with Claude Code

- **Planning:** multi-file changes start in plan mode. The plan names the files, the tests and the FR or slice it serves; wait for approval before writing code.
- **Slices:** work one slice at a time with `/slice <id>`. A slice ends with `pnpm verify` passing and a Conventional Commit.
- **Review:** never approve your own diff in the same context. Use a `review-*` subagent or `/self-review`.
- **Dependencies:** add packages only through `/add-dependency`.
- **Evidence:** "done" needs proof. Paste the command you ran and its result.
- **Hooks:** every edited file is formatted automatically. The Stop hook blocks once while type-check or lint fails.

# Gotchas

- **Windows dev machine:** scripts must work in both PowerShell and bash. Use Node scripts, no inline `VAR=x`, no `rm -rf`.
- **MySQL:** `pnpm verify` and the integration tests need it running in Docker (`pnpm db:up`).
- **Vite:** `VITE_*` values are fixed at build time.
- **TypeScript:** keep it pinned to 6.0.x. `vue-tsc` and `typescript-eslint` don't support TypeScript 7 yet.
