## Summary

<!-- What does this PR do? Which package or app does it touch? -->

## Scenario Impact Declaration

- [ ] **scenario-impact**: `updated` | `needs_automation` | `none`
- [ ] Added release note in `docs/release-notes/<date>-<feature>.md` (required for changes under `packages/`, `apps/`, `examples/`)
- [ ] Recorded a changeset with `pnpm changeset` (required for user-facing changes to a published package)

## Related

<!-- Closes #123 -->

## Type of change

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor / chore
- [ ] Docs

## Governance & Pre-Review Checklist

- [ ] **Worktree Isolation**: work was done in an isolated branch/worktree.
- [ ] **Human Approval**: ADR pair approved by the maintainer (if non-trivial).
- [ ] **Boundary Validation**: external payloads validated and mapped to domain types.
- [ ] **Wiring Tests**: tests cover engine routes, adapters, handlers and UI states, not only helpers.
- [ ] **Test-First Fix**: the bug fix was preceded by a failing regression test.
- [ ] **Precision**: USDC amounts stay `bigint` subunits until the display edge.
- [ ] **Loading & Error States**: async actions never freeze the UI.
- [ ] **Layering**: downward imports only (`cctp` -> `core` -> `react` -> apps and examples).
- [ ] **Human Comments**: no AI-written comments; comments only where the code cannot speak.
- [ ] **Docs**: public API changes are reflected in `apps/docs` and the README.
- [ ] **Preflight Gate**: `./scripts/preflight.sh` passed with zero errors/warnings.
- [ ] **Manual Verification**: exercised the flow in the playground or the affected example.

## Fund Safety

<!-- Fill in when the change touches burn, mint, recovery, persistence, signing,
     allowances, fees, or chain routing. Otherwise write N/A. -->

- [ ] No path burns funds before every check that could stop the mint has passed
- [ ] Every in-flight transfer still has a recovery surface
- [ ] Network (mainnet or testnet) comes from the source chain, never from config alone
- [ ] Replay safety argued
- [ ] No logging of private keys or secrets

## How this was verified

<!-- What you ran or clicked. For money paths, name the chain pair and the flow you completed. -->

## Screenshots / notes
