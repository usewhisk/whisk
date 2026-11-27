# ADR: USDC only, no swap

- **Status:** Accepted 2026-11-27
- **Date:** 2026-11-27
- **Scope:** `apps/docs`, `examples/playground`, `packages/react` (CSS only),
  `packages/core` (one error mapping), `ROADMAP.md`. No change to `packages/cctp`,
  the engine, any public type, or Whisk Cloud.

## Context

Whisk is a payment layer that moves USDC between chains over CCTP V2. A
reviewer suggested dropping swap so the product says one thing: USDC across
chains. The maintainer agreed.

Most of the swap code is already gone. The 0.2 rebuild (#57) removed App Kit,
the kit key, `SwapTab`, `useWhiskSwap` and every swap type and prop, and the
0.1 to 0.2 migration guide tells integrators to delete them. What remains are
leftovers that still describe swap as a feature or plan:

- **Docs site:**
  - the page metadata in `apps/docs/src/app/layout.tsx` says Whisk "sends,
    bridges, and swaps USDC" and is "Built on Circle App Kit";
  - the marketing components `how-it-works.tsx`, `built-for.tsx`,
    `feature-bento.tsx`, `recipes-showcase.tsx` and `widget-mockup.tsx` show
    `<SwapTab kitKey>`, `useWhiskSwap`, a Circle App Kit key in setup, and
    "send, bridge, or swap";
  - `hooks/use-whisk.mdx` links to `/docs/hooks/use-whisk-swap`, a page that
    does not exist.
- **Playground:** `.env.example` documents `CIRCLE_KIT_KEY` and
  `KIT_KEY_ALLOWED_HOSTS` for an `app/api/kit-key` route that no longer exists,
  and the README lists a Swap tab and a `NEXT_PUBLIC_CIRCLE_KIT_KEY` variable.
- **`@usewhisk/react`:** `styles.css` still ships `.whisk-swap-row`,
  `.whisk-swap-row__amount`, `.whisk-swap-row__token` and `.whisk-swap-flip`.
  No component uses them.
- **`@usewhisk/core`:** `errors.ts` maps "no route / route not found" messages
  from swap and routing APIs to a "No quote available for this pair" message.
  No CCTP path produces such a message; `@usewhisk/cctp` reports a missing route
  with its own typed `no_route` code.
- **`ROADMAP.md`:** a "Swap (cross-token)" section plans a separate aggregator
  package (LI.FI, 0x, 1inch).

The first two mislead integrators today: the docs site tells them to get a key
Whisk no longer reads and to import components that do not exist.

## Decision

1. **Product statement.** Whisk moves USDC between chains. It does not swap
   tokens, and swap is not on the roadmap. The README, the docs site and
   `ROADMAP.md` say so in those words.
2. **Docs site.** Every swap, `SwapTab`, `useWhiskSwap`, kit key and App Kit claim
   in the metadata and the marketing components is rewritten to what ships:
   `WhiskSend`, `useWhisk`, `useWhiskAccount`, direct CCTP V2. The dead
   `use-whisk-swap` link goes. Text where "swap" is an ordinary English verb
   ("swap the recipient picker", "the failure UI swaps") and every
   `font-display: swap` stay.
3. **Playground.** The kit key variables, the Swap tab row and the swap control
   panel line are removed from `.env.example` and the README.
4. **`@usewhisk/react`.** The four `.whisk-swap-*` rules are deleted. Released as
   a patch: no component or documented class uses them.
5. **`@usewhisk/core`.** The swap "no route" message mapping and its test are
   deleted, so such text falls through to the generic message with the original
   error kept on `cause`. Released as a patch. The test named "ignores `bps`
   (reserved for Swap)" is renamed, since `FeePolicy.bps` is a percentage
   merchant fee and has nothing to do with swap.
6. **`ROADMAP.md`.** The swap section is replaced by one line under "Not
   planned", with the reason: Whisk is a settlement surface for USDC, and a token
   swap brings price, slippage and liquidity risk that the product deliberately
   does not take on.
7. **History stays.** CHANGELOGs, the 0.1 to 0.2 migration guide, earlier ADRs,
   release notes and research notes are records and are not edited.
8. **Guard.** A test in `apps/docs` fails if the marketing components or page
   metadata mention `SwapTab`, `useWhiskSwap`, `kitKey` or "App Kit", so the claims
   cannot return unnoticed.

## Diagram

```mermaid
flowchart LR
  subgraph Ships today
    A[WhiskSend / useWhisk] --> B[@usewhisk/core engine] --> C[@usewhisk/cctp: burn, attest, mint]
  end
  subgraph Removed by this ADR
    D[Docs claims: SwapTab, useWhiskSwap, kit key, App Kit]
    E[Playground kit key env and Swap tab docs]
    F[.whisk-swap-* CSS]
    G[core 'no route' swap message]
    H[ROADMAP swap package]
  end
```

## Consequences

- **Easier:** the docs site matches the packages; integrators stop looking for
  a kit key and a swap tab. One less roadmap promise.
- **Harder:** a merchant who wants pay-in-any-token has to swap before paying,
  in their own wallet or app. Whisk will not do it for them.
- **Compatibility:** no public type or export changes. Someone who styled
  `.whisk-swap-*` in their own CSS loses nothing that renders, because nothing
  renders those classes. An app that matched on the exact "No quote available
  for this pair" text gets the generic message instead; no CCTP flow produced it.
- **Packages:** patch changesets for `@usewhisk/core` and `@usewhisk/react`.

## Alternatives considered

- **Keep swap on the roadmap as a separate package.** Leaves a promise the
  product has decided not to keep, and keeps the docs ambiguous. Rejected.
- **Only fix the docs site, leave the code leftovers.** The CSS and error
  mapping are small, but they are swap code in published packages, and leaving
  them invites the claim back. Rejected.
- **Also drop `FeePolicy.bps`.** It is an ignored field for a future percentage
  fee, not swap. Removing it is a breaking type change with its own question to
  decide. Out of scope.

## Verification

- `./scripts/preflight.sh` passes in full.
- The new `apps/docs` guard test fails before the docs edits and passes after.
- `git grep -i swap` on `apps/docs/src`, `examples`, `packages/*/src` and
  `README.md` returns only English-verb uses and `font-display: swap`.
- The docs site builds; the home page, `/docs/hooks/use-whisk` and the setup
  section render with no swap, kit key or App Kit text, checked by hand.
- The playground starts from `.env.example` with no kit key and sends USDC Base
  Sepolia to Arc Testnet.
