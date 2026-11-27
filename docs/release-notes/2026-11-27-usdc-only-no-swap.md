---
date: 2026-11-27
feature: USDC only, no swap
scope: chore
scenario-impact: none
---

# USDC only, no swap

Whisk moves USDC between chains and does not swap tokens
([ADR](../adr/ADR-2026-11-27-usdc-only-no-swap.md)). The 0.2 rebuild already removed
App Kit, the kit key, `SwapTab` and `useWhiskSwap`; this removes what still described
them.

- **Docs site:** the page metadata, the marketing sections and the footer describe
  what ships (`WhiskSend`, `useWhisk`, `useWhiskAccount`, CCTP V2 directly) instead of
  swap, `SwapTab`, `useWhiskSwap`, a kit key or App Kit. The setup snippet shows
  `<WhiskProvider config={config}>`. The dead `use-whisk-swap` link is gone, and the
  refund page no longer suggests a swap.
- **Playground:** `.env.example` and the README drop the kit key variables and the
  Swap tab.
- **`@usewhisk/react` (patch):** the four unused `.whisk-swap-*` rules are gone from
  `styles.css`.
- **`@usewhisk/core` (patch):** "no route" text from a swap or routing API gets the
  generic message instead of its own. No CCTP path produces it.
- **`ROADMAP.md` and `README.md`:** the swap package is gone from the roadmap, token
  swaps are a non-goal with the reason, and both say Whisk does not swap tokens.
- **Guard:** `scripts/usdc-only.test.mjs` fails if swap, a kit key or App Kit comes
  back into the docs site's pages and metadata, the playground's setup, the widget's
  styles or the roadmap's headings.
- **Left as records:** CHANGELOGs, the 0.1 to 0.2 migration guide, earlier ADRs,
  release notes and research notes.
