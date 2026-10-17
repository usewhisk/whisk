# Contributing to Whisk

Thanks for being interested. This guide covers the practical steps for
making a change to Whisk — setup, conventions, what to run before you
PR, how reviews work. If something here is wrong or unclear, that's a
contribution too: open an issue or PR.

**Security vulnerabilities go through private disclosure, not this
guide.** Read [SECURITY.md](./SECURITY.md) for the reporting flow,
scope, and response timeline.

## Ground rules

Be decent, be specific, assume good faith. Critique code, not people.
Most disagreements are about constraints the other side hasn't seen
yet — ask before objecting.

[AGENTS.md](./AGENTS.md) is the rulebook for every change, human or agent:
ADR approval for non-trivial work, worktree isolation, test-first bug fixes,
and `./scripts/preflight.sh` before every pull request. Craft rules live in
[the engineering standards](./.claude/skills/whisk-engineering-standards/SKILL.md).

---

## Repo shape

This is a pnpm workspace.

```
whisk/
├── packages/
│   ├── core/         @usewhisk/core — engine, types, recovery primitives, no React
│   └── react/        @usewhisk/react — provider, hooks, components, widget
├── examples/
│   ├── playground/  the playground used for QA + end-to-end testing
│   └── …              one app per integration pattern (checkout, donate, payroll, etc.)
├── apps/
│   └── docs/          the documentation site (www.usewhisk.xyz/docs) — Fumadocs
└── .github/workflows  CI + release pipelines
```

Source of truth for cross-package types is **`packages/core`**. The
React layer wraps it with provider + hooks + components; recipes /
examples consume the public surface only.

---

## Prerequisites

- **Node.js ≥ 20** (see `engines.node` in `package.json`).
- **pnpm 10.x** — pinned via the `packageManager` field. `corepack`
  picks it up automatically.
- A wallet for end-to-end testing (MetaMask / Coinbase Wallet for
  EVM, Phantom / Solflare for Solana).
- USDC on at least one testnet, from the [Circle Faucet](https://faucet.circle.com/).

## Setup

```bash
git clone https://github.com/usewhisk/whisk
cd whisk
pnpm install              # installs everything and the git hooks
pnpm build                # build core + react packages once
```

You also need gitleaks (`brew install gitleaks`). `pnpm install` sets up lefthook,
which runs on every commit and push:

| Hook | Checks |
|---|---|
| `pre-commit` | Prettier on staged files, gitleaks, no em-dashes, no `@ts-ignore`, `@ts-nocheck` or `as any` |
| `commit-msg` | Conventional Commits, no AI co-author trailers |
| `pre-push` | No push to `main`, `<type>/<kebab-description>` branch names, `./scripts/preflight.sh --fast` |

Never skip them with `--no-verify`. CI runs the same checks on every pull request.

## The development loop

```bash
# Watch-mode build for the packages
pnpm dev

# Run the playground (playground) in another terminal
pnpm --filter @usewhisk/playground dev

# Now open http://localhost:3000/playground — your widget edits hot-reload.
```

### Verifying before you commit

```bash
pnpm typecheck            # tsc --noEmit across every package
pnpm test                 # vitest, runs core's 80+ unit tests
pnpm build                # tsup builds + ensures dist/ stays valid
```

CI runs all three on every PR. Run them locally before pushing so the
red checkmark on GitHub isn't your discovery channel.

For widget UX changes, **mount your branch in the playground and
verify in a browser** — typecheck and tests pass perfectly fine for
broken UI.

---

## Commit conventions

We use a light flavour of [conventional commits](https://www.conventionalcommits.org/):

```
type(scope): short summary

Optional longer body. Wrap at ~72 characters. Explain WHY when it
isn't obvious from the diff.
```

Types we use:

- **feat** — new user-facing capability
- **fix** — bug fix, including upstream compatibility patches
- **chore** — tooling, deps, build, infra (anything not visible to widget users)
- **docs** — docs site or in-source comment-only changes
- **refactor** — internal restructuring with no behavioural change
- **test** — adding or fixing tests with no behaviour change
- **perf** — measurable performance improvement

Scopes you'll see in the history: `core`, `react`, `playground`,
`docs`, `chains`, `recovery`, `build`, `testing`. Use what fits;
invent a new one if needed.

**One commit per logical change.** Bundle related diffs; split unrelated
diffs. If a PR has 14 commits and 13 of them are "fix typo", squash
before requesting review.

---

## Pull requests

1. **Open an issue first for anything non-trivial.** Small fixes can
   go straight to PR; new features / API changes need discussion. The
   maintainers may have context (Circle SDK quirks, upcoming work)
   that changes the shape.
2. **Branch from `main`.** Name it descriptively:
   `feat/preflight-checks`, `fix/solana-adapter-deps`.
3. **Open the PR against `main`** with a description that covers:
   - What changed and why (the user-visible diff, not the file list).
   - How you tested it (which playground flow, which testnet pair).
   - Any docs that need to follow up.
   - Whether you ran a changeset (`pnpm changeset`) for user-facing
     changes that should hit the next release.
4. **Pass CI.** Failing CI on `main` blocks releases for everyone.
5. **Respond to review comments by editing the diff,** not by
   replying-as-defence. If a reviewer is wrong, push back politely
   and explain.

Reviewers will check: typecheck/tests/build green, no `any` snuck in,
no `console.log` left behind, no orphaned imports, public API
changes documented + exported, recovery / fund-safety paths have
the right guard rails.

### Changesets

User-facing changes need a changeset entry so the next release notes
are generated correctly:

```bash
pnpm changeset                   # interactive — pick packages + bump kind
git add .changeset/<file>.md
```

Don't add a changeset for:

- Docs-only changes (markdown / mdx).
- Tooling / CI / build infrastructure.
- Test-only changes.
- Anything in `examples/` (not published).
- Internal refactors with zero exported surface change.

If you're unsure, add one — better to have a tiny entry than miss a
real change.

---

## Code conventions

- **TypeScript strict.** No `any` in new code; if you must, leave a
  comment explaining why. Cast through `unknown` first when
  bridging an untyped foreign value.
- **No barrel re-exports of types you don't intend to publish.** The
  public surface is `packages/*/src/index.ts`. Don't widen it
  accidentally.
- **Comments explain WHY, not WHAT.** The code already says what it
  does; comments earn their keep by naming the constraint,
  invariant, or upstream bug they exist to work around.
- **Prettier handles formatting.** Don't fight it. If the auto-format
  is unreadable, the underlying expression is probably too dense
  and wants extraction.
- **`use client`** belongs at the top of any file that uses React
  hooks. Whisk packages are consumed in Server Components, so the
  directive is load-bearing.

### Testing

- **Pure functions go in `packages/core`** with a corresponding
  `*.test.ts` file. Vitest is the runner.
- **Hook / component behaviour** is exercised through the playground,
  not via React Testing Library — the wallet adapters don't mock
  cleanly, and end-to-end behaviour is what matters for fund safety.
- **State machine changes** must have unit tests. `machine.test.ts`
  is the table of truth for state transitions; new actions and edge
  cases belong there.

### Style

Voice in the codebase comments + docs is technical, terse, slightly
opinionated. Don't write marketing copy in inline comments and don't
apologise in commit messages. State facts.

---

## When you touch fund-safety paths

The recovery story (`packages/core/src/recovery/*`, the retry surface
in `ResultStep`, the persistence in `useWhisk`, the manual-mint
fallback) is the part of Whisk that genuinely prevents users from
losing money. Changes there get extra scrutiny:

- **Don't introduce new code paths that can leave funds in transit
  without a recovery surface.** Every failure mode needs either a
  retry path, a manual-mint escape hatch, or a clear "your funds are
  safe at $address" message — never just an error toast.
- **Replay safety must be argued.** If your change touches
  attestation or nonce handling, the PR description needs a paragraph
  on why a replay isn't possible.
- **Tests preferred over comments.** A unit test that confirms
  invariant X is harder to silently break than a comment that says
  invariant X holds.

The [error handling concepts page](https://www.usewhisk.xyz/docs/concepts/error-handling)
has the full story. Read it before changing recovery code.

---

## Releases (maintainers)

Releases are driven by changesets + the `release` workflow in
`.github/workflows/release.yml`.

```bash
pnpm changeset            # accumulate during normal development
pnpm version              # consume changesets → bump versions + write CHANGELOG entries
pnpm release              # CI runs this — builds, then `changeset publish`
```

Manual publishes are emergency-only and require a maintainer with
npm publish rights.

---

## Questions

- Is the docs site at https://www.usewhisk.xyz/docs.
- Bug? Open an
  [issue](https://github.com/usewhisk/whisk/issues/new/choose).
- Idea? Open a
  [discussion](https://github.com/usewhisk/whisk/discussions) before
  the issue — alignment is cheaper than a closed PR.

Thanks for contributing.
