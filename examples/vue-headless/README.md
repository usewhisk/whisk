# vue-headless

A minimal Vue 3 example that drives `@usewhisk/core` directly. No
React, no `@usewhisk/react`, no wagmi.

This recipe exists to prove the engine is genuinely
framework-agnostic and to show Vue developers a starting shape.

## What's in here

- **`src/composables/useWhiskEngine.ts`** — the Vue equivalent of
  `useWhisk`. Wraps the engine with `ref` reactivity, manages the
  send state machine, builds the App Kit adapter from
  `window.ethereum`.
- **`src/App.vue`** — single-page UI: connect → enter amount +
  recipient → quote → confirm → step rail. Same UX shape as the
  React widget, rendered with Vue templates.

## Running it

```bash
pnpm install
pnpm --filter @usewhisk/example-vue-headless dev
```

Open `http://localhost:3014`. You'll need a browser wallet
(MetaMask, Rabby, etc.) with USDC on Base Sepolia for the default
flow.

## Scope

- EVM only. Solana would need
  `@circle-fin/adapter-solana-kit`-based wiring in
  `useWhiskEngine`, similar to the React example.
- Two chains (Base Sepolia → Arc Testnet) wired in the engine.
  Add to `chains:` in `useWhiskEngine.ts` to widen.
- No swap, no Unified Balance, no refund — those are all
  available on the same `engine` object, this recipe just
  doesn't surface them. Same composable pattern works for each.

## What you don't get vs `@usewhisk/react`

- No `<ConnectModal>` — this recipe goes straight to
  `eth_requestAccounts`. A real Vue app would either ship its
  own modal or wire up something like Reown AppKit.
- No theming system. The widget uses a small inline stylesheet.
- No ENS chip rendering. Resolution still works because
  `engine.resolve` is pure TS — but the visual chip lives in
  the React widget.

Everything else (the bridge state machine, error categories,
metadata correlation, receipt derivation, refund support) works
identically because it's all in `@usewhisk/core`.
