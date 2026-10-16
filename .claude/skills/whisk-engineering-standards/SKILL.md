---
name: whisk-engineering-standards
description: Engineering standards for Whisk. Read before writing or reviewing any code, comment, or document in this repository.
---

# Whisk Engineering Standards

These rules apply to every contributor, human or agent. They are not suggestions.
`CONTRIBUTING.md` covers local setup; this file covers how the code must be written.

## Architecture

Whisk is a pnpm workspace. Packages are layered, and every import points downward:

```
packages/cctp    CCTP V2 protocol layer: chain registry, ABIs, Iris client,
                 burn and mint builders per ecosystem. No signing, no wallet state.
      |
packages/core    Framework-agnostic engine (createWhisk): quote, send, refund,
                 recovery, fees, webhooks. No React, no DOM assumptions.
      |
packages/react   Provider, widget, hooks, wallet adapters, theme.
      |
apps/*, examples/*   Consumers only. Never imported by a package.
```

- A package never imports a package above it. `core` never imports React. `cctp`
  never imports `core`.
- Apps and examples import packages through their public entry points only, never
  through `src/` or `dist/` paths.
- Code shared by two packages belongs in the lower one.
- `packages/cctp` lands with the v1 rebuild; until then `core` is the bottom layer.

## Correctness

- Verify each implementation before moving to the next. Do not stack unverified work.
- No shortcuts: no `@ts-ignore`, no `any`, no swallowed rejection, no hardcoded value
  that hides the real path.
- No damage control: find the cause and fix it, never the symptom.
- Handle errors where they happen and surface them to the user in a useful state.
- Strict typing stays on.
- Tests prove behaviour: happy path, validation failure, error state, loading state.
- Money is `bigint` subunits. Never `parseFloat` an amount.
- Validate before you burn. Anything that can fail on the destination (recipient
  format, token account, network) is checked before the source transaction is sent.
- Contract addresses, domain IDs and chain IDs come from Circle's published
  deployments. Cite the source in the PR when you add or change one.

## Comments and naming

- No AI-written comments. Every comment is written as a human engineer would write it
  by hand, in plain English. Short, clear, specific.
- Default to no comment. A comment explains why, or a non-obvious what.
- No narration of obvious code, no banners, no filler, no em-dashes; use a comma,
  colon, or period.
- No references to the agent, the session, or the history of the change.
- Name things for what they are.

## Documentation

- Technically correct, unambiguous, jargon defined on first use, examples runnable.
- Docs in `apps/docs` match the exported API. A PR that changes a public signature
  updates the docs page in the same PR.

## Git and review

- One issue, one branch, one pull request. Branch prefixes: `feat/`, `fix/`, `chore/`.
- Never push to `main`. Squash merges only. Branch deleted on merge.
- Commits are atomic with a message that says what changed and why.
- Never add AI co-author trailers or session footers to commits or PRs.
- Never commit or push on a contributor's behalf without being asked.
- Do not commit secrets. `.env` files stay out of git; `.env.example` holds names only.

## Tooling

- pnpm only (the version pinned in `packageManager`). Node 22 (`.nvmrc`).
- Prettier formats everything it covers; `pnpm format:check` must be clean.
- Run `./scripts/preflight.sh` before opening a pull request. CI runs the same gates.
- When a task needs a library, read its current docs first (Context7, Circle and Arc
  docs); do not code from memory.
