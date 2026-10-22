# Whisk roadmap

Whisk is an open-source React widget for USDC payments. It talks to
Circle's Cross-Chain Transfer Protocol V2 directly. The result is a
small dependency footprint, a clean audit surface, and fast iteration
on new chain support.

This document is the public source of truth for what's shipped, what's
in progress, and what's deferred. It supersedes any internal planning
docs in earlier versions of this repo.

## v1 (current)

The first stable release covers the canonical USDC payment flows that
most apps need.

### What v1 ships

- **`<WhiskSend>`** — drop-in widget with two tabs:
  - **Send** — same-chain USDC transfer. Plain ERC-20 transfer, native
    gas on the source chain, nothing else.
  - **Bridge** — cross-chain USDC transfer via CCTP V2 with Circle's
    Forwarder Service. Customer signs once on the source chain; Circle's
    Orbit relayer mints on the destination. Recipient does not need
    native gas on the destination chain.
- **`<WhiskReceipt>`** — settlement-status page that polls Iris and
  shows live progress (submitted → awaiting attestation → attested →
  settled, or failed).
- **`engine.refund`** — server-side primitive to issue a refund to the
  original payer of a previous transfer. Mechanically a reverse send /
  bridge with metadata that links it to the original tx hash.
- **Mid-flight recovery** — if a customer's tab crashes or refreshes
  mid-bridge, the next visit resumes from the last known state
  (localStorage snapshot, manual mint if the forwarder failed).
- **Webhook primitives** — `signWebhook` + `verifyWebhook` using
  HMAC-SHA256 over a canonical signed string. Runtime-agnostic Web
  Crypto under the hood (Node 18+, Deno, Bun, Workers, Vercel Edge).
- **Headless engine** — `@usewhisk/core` ships with no React
  dependency. Drop it into Vue, Svelte, Node, Cloudflare Workers, or
  any non-React surface.
- **Mainnet and testnet** — both shipped from day one. Every chain in
  the registry has a testnet counterpart. Mode is a config flag.

### Chains supported in v1 (EVM only)

CCTP V2 deploys the same `TokenMessengerV2` address across every
supported EVM chain. Adding a new chain means adding a row to the
registry — no new code path.

| Mainnet | Testnet | Domain |
|---------|---------|--------|
| Ethereum | Sepolia | 0 |
| Avalanche | Fuji | 1 |
| Optimism | OP Sepolia | 2 |
| Arbitrum | Arbitrum Sepolia | 3 |
| Base | Base Sepolia | 6 |
| Polygon | Amoy | 7 |
| Unichain | Unichain Sepolia | 10 |
| Linea | Linea Sepolia | 11 |
| Codex | Codex Testnet | 12 |
| Sonic | Sonic Testnet | 13 |
| World Chain | World Chain Sepolia | 14 |
| Sei | Sei Testnet | 16 |
| XDC | XDC Apothem | 18 |
| HyperEVM | HyperEVM Testnet | 19 |
| Ink | Ink Sepolia | 21 |
| Plume | Plume Testnet | 22 |
| EDGE | Edge Testnet | 28 |
| Morph | Morph Holesky | 30 |

Whisk only enables Fast Transfer for chains that support it. Standard
Transfer is the default fallback for chains that don't.

### Architecture (three packages)

- **`@usewhisk/cctp`** — protocol layer. Chain registry, contract
  ABIs, Iris API client, fee math, burn/mint encoders, forwarder
  hookData.
- **`@usewhisk/core`** — engine. State machine, adapter interface,
  refund / receipt / webhook / recovery / metadata primitives. Uses
  `@usewhisk/cctp` for protocol work.
- **`@usewhisk/react`** — UI layer. Widget, provider, theme system,
  hooks. Wallet connection via wagmi directly.

External dependencies: viem (EVM), wagmi (wallet connect), Radix UI
(primitives), TanStack Query (cache). One external HTTP endpoint:
Circle's Iris API.

## Deferred (in roadmap order)

Each section below is a real feature we plan to ship, paused for
either scope, demand, or upstream readiness reasons. Order matters —
top of list ships first.

### v1.1 — Solana support

Solana CCTP V2 is live on mainnet (domain 5). Adding Solana means a
new ecosystem adapter in `@usewhisk/cctp` and wallet-adapter wiring
in `@usewhisk/react`. The engine and state machine are already
ecosystem-agnostic — the architecture was designed for this.

Considerations:
- Solana programs use `Anchor` / IDL, different from EVM ABI calls.
- `mintRecipient` on Solana is the recipient's USDC token account
  (ATA), not their wallet pubkey. We compute the ATA before encoding.
- Forwarder is not supported as a Solana destination — Solana-bound
  bridges require the user to have SOL for the mint. We surface this
  in the UI.

### v1.2 — Starknet support

Starknet CCTP V2 mainnet shipped December 2025 (domain 25). Cairo
contracts, separate SDK (`starknet.js`). The existing portfolio
already includes Starknet work, so the ecosystem isn't unfamiliar.

### v1.3 — Stellar support

Stellar CCTP V2 mainnet shipped May 2026 (domain 27). The most
complex non-EVM ecosystem to support:
- USDC on Stellar uses 7 decimals; everywhere else uses 6. Engine
  must convert at the boundary.
- Stellar requires a `CctpForwarder` contract on every inbound
  transfer. `mintRecipient` and `destinationCaller` must both be the
  forwarder address; the actual recipient strkey goes in `hookData`.
  Wrong destinationCaller → funds permanently stuck.
- Addresses are `strkey` strings (`G…` accounts, `M…` muxed, `C…`
  contracts). Validation differs from EVM.

### Swap (cross-token)

Whisk v1 is USDC-only. Cross-token swap (USDC ↔ ETH, USDC ↔ EURC,
etc.) ships as its own package when we integrate an aggregator
(LI.FI, 0x, 1inch, or similar). Decoupled from the payment widget
because the value props are different: swap is a discovery /
liquidity surface, payments are a settlement surface.

Why not in v1: the right answer is an aggregator that works on
mainnet and testnet. That's its own piece of work and lives in a
dedicated v1.x package.

### Unified Balance / Circle Gateway

Gateway is Circle's chain-abstracted USDC pool — deposit on one
chain, spend on another with sub-500ms settlement. Useful for AI
agents, treasuries, and payments where the user wants to feel
chain-agnostic.

Why not in v1: Gateway is a Circle product layer above CCTP. It's
opinionated about which chains are in the pool (smaller subset than
CCTP), needs a deposit + spend + delegate flow triad, and is
specifically a Circle integration concern. Ships as `@usewhisk/gateway`
when there's real merchant demand.

### Custom fee (integrator monetization)

Many integrators want to layer their own fee on top of Whisk
transfers (a marketplace taking 1% on every transaction, etc.).

Why not in v1: implementation options are either a Whisk-deployed
fee-splitting contract (significant overhead) or EIP-5792 batched
calls combining a fee transfer with the burn (clean but
wallet-support-dependent). Ships in v1.x once we settle on the
implementation.

### Agent SDK (`@usewhisk/agent`)

A server-side / agent-side package that exposes Whisk operations as
plain async functions. Same engine, different surface. Drops easily
into Anthropic tool use, LangChain, x402 middleware, or any
autonomous flow.

The headless `@usewhisk/core` is already framework-agnostic, so the
agent package is mostly composition. Ships once v1 is stable.

### Mini-app recipes (Farcaster, Telegram, Base App)

Wrap the widget for embedded wallets in each environment. Each is a
recipe rather than a package — same `@usewhisk/react` widget, just a
different connector wiring.

### Whisk Cloud (managed service)

Recovery monitoring (relayer that finishes mid-flight bridges when
users have closed tabs), aggregated analytics across all integrating
sites, multi-tenant management, enterprise SLA. Separate repo,
funds the open-source work, never gates protocol features behind a
paid tier.

### Audit + mainnet hardening

Pre-audit hardening pass, then external security audit (Spearbit,
Cantina, Code4rena, or equivalent). Scope: `@usewhisk/cctp` +
`@usewhisk/core` + live-funds paths in `@usewhisk/react`. Triggered
when the v1 ship date is locked.

## Architectural principles (apply to every change)

These are constraints, not aspirations. If a feature can't ship
cleanly within them, the design is wrong.

1. **Headless engine first.** New behavior lands in `@usewhisk/core`
   as plain TypeScript first, then `@usewhisk/react` consumes it.
   Anything React-only blocks the Vue / Node / agent paths.
2. **Provider / adapter pattern over branching.** Per-chain and
   per-wallet differences live behind a typed interface, not as
   `if (chainKind === 'evm') {…}` inside the engine.
3. **Pure functions for logic, hooks for orchestration.** State
   transitions, fee math, address validation, attestation polling are
   pure functions tested in isolation. Hooks call into them, never
   the other way around.
4. **Small, stable public API.** Every export is part of the
   contract. Don't export internals.
5. **No abstraction without two callers.** First case proves the
   pattern; second one earns the abstraction.
6. **Tests at the seam.** Each adapter, provider, and resolver gets
   unit tests against its contract.
7. **Verify each phase end-to-end before the next.** Each rebuild
   phase has an explicit verification gate.

## Non-goals

These are deliberate omissions, not deferrals:

- **CCTP V1 (Legacy) support.** Aptos, Sui, and Noble are V1-only.
  V1 uses different contracts, different APIs, and a deprecating
  protocol. We add support if and when those chains migrate to V2.
- **Wrapped USDC.** Whisk only handles native USDC. Wrapped variants
  (USDC.e, etc.) are out of scope.
- **Non-USDC stablecoins.** EURC, PYUSD, etc. are not in v1. We may
  add them after v1 ships, but USDC is the focus.
- **Whisk-owned relayer.** Circle's Orbit forwarder handles the
  destination mint for us. We don't build our own relayer
  infrastructure.

## Versioning

`@usewhisk/cctp`, `@usewhisk/core`, and `@usewhisk/react` ship as
matching versions. v1.0.0 is the rebuild's first release.
Breaking changes go through changesets and bump the major version.
The protocol layer (`@usewhisk/cctp`) follows CCTP V2's own
versioning where it makes sense.

## Contact

This roadmap is open. If you're a merchant or integrator who needs a
deferred feature sooner, open an issue with the use case. Priorities
get re-ordered based on real demand, not internal speculation.
