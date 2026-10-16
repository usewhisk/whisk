---
date: 2026-10-15
feature: AI governance rulebook, preflight gates, and the quality CI check
scope: chore
scenario-impact: none
---

# AI governance

Contributors, human or agent, now follow `AGENTS.md`: ADR approval for non-trivial
work, worktree isolation, test-first bug fixes, human-written comments only, and a
five-gate preflight before every pull request.

Technical shape, per [ADR-2026-10-15-ai-governance](../adr/ADR-2026-10-15-ai-governance.md):

- `scripts/preflight.sh` runs format check, lint, typecheck, tests and the app build.
  The pre-push hook runs it without the app build.
- CI runs `checks`, `tests`, `build` and `audit` in parallel and reports a single
  `quality` check.
- `scripts/check_release_notes.sh` requires a note in `docs/release-notes/` when
  `packages/`, `apps/` or `examples/` change.
- `apps/docs` and the playground drop their `lint` scripts; `next lint` linted nothing
  in either and no longer exists in Next 16.
- The playground pins `outputFileTracingRoot`, so builds inside a worktree trace
  files from that worktree and not from the outer checkout.

No package code or public API changed.
