<img src="./banner.png" alt="Whisk Logo" width="100%" />

# Whisk

**Embeddable React widget for USDC payments and cross-chain bridges. Built directly on CCTP V2.**

Drop-in React component: same-chain sends and cross-ecosystem bridges over CCTP V2 Fast Transfer. EVM, Solana, Stellar, and Starknet wallets. Multichain ENS resolution in the box. Mid-flight recovery if a burn lands but the mint doesn't. Theme with CSS variables, go headless with `useWhisk()`. MIT-licensed.

[![npm @usewhisk/react](https://img.shields.io/npm/v/@usewhisk/react?style=flat&label=%40usewhisk%2Freact&color=d65c3c&logo=npm)](https://www.npmjs.com/package/@usewhisk/react)
[![npm @usewhisk/core](https://img.shields.io/npm/v/@usewhisk/core?style=flat&label=%40usewhisk%2Fcore&color=d65c3c&logo=npm)](https://www.npmjs.com/package/@usewhisk/core)
[![npm @usewhisk/cctp](https://img.shields.io/npm/v/@usewhisk/cctp?style=flat&label=%40usewhisk%2Fcctp&color=d65c3c&logo=npm)](https://www.npmjs.com/package/@usewhisk/cctp)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg?style=flat)](LICENSE)
[![Types](https://img.shields.io/badge/types-TypeScript-3178c6?style=flat)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat)](CONTRIBUTING.md)
[![CCTP V2](https://img.shields.io/badge/protocol-CCTP%20V2-0052FF?style=flat)](https://developers.circle.com/cctp)

---

## What is Whisk?

Whisk is a drop-in React component for USDC payments. One React
component, four ecosystems, native CCTP V2 Fast Transfers under the
hood:

- **Send** USDC to any address on the same chain
- **Bridge** USDC across chains and ecosystems via CCTP V2
- Pay through **any wallet** — MetaMask, Phantom, Freighter,
  Argent X, and dozens more
- See a **transparent fee breakdown** before confirming
- Watch the transfer progress through every step (`authorize` → `burn` → `attest` → `mint`)

Whisk speaks CCTP V2 natively — no third-party SDKs, no adapter
layers to keep up to date. When Circle ships a new CCTP chain, we
add it in one file and everyone gets it.

```tsx
<WhiskProvider config={config}>
  <WhiskSend onSuccess={(r) => console.log("done:", r.finalTxHash)} />
</WhiskProvider>
```

That's it. The widget handles wallet connection, chain switching,
recipient validation, fee preview, and the whole transaction
lifecycle.

---

## Why Whisk?

Building USDC payments from scratch means:

- A UI for the multi-step CCTP burn → attest → mint state machine
- Wallet connection across four ecosystems (EVM, Solana, Stellar, Starknet)
- Per-ecosystem address validation
- Fee math across burn fees, forwarder fees, and gas
- Iris polling with retry and recovery
- Manual mint on Stellar and Starknet (Iris only auto-forwards to EVM)
- The Cairo `ByteArray` encoding for Starknet destinations
- The Stellar CctpForwarder pattern for inbound Stellar mints

That's the work Whisk does once, well, and ships as a widget so you
spend your time on the rest of your product.

---

## Quickstart

### Install

```bash
pnpm add @usewhisk/react @tanstack/react-query
```

### Drop it in

```tsx
import {
  WhiskProvider,
  WhiskSend,
  createWhiskConfig,
  evm,
} from "@usewhisk/react";
import "@usewhisk/react/styles.css";

const config = createWhiskConfig({
  wallets: [evm({ projectId: process.env.WALLETCONNECT_PROJECT_ID! })],
  chains: ["Base_Sepolia", "Ethereum_Sepolia"],
  defaultDestinationChain: "Ethereum_Sepolia",
});

export default function App() {
  return (
    <WhiskProvider config={config}>
      <WhiskSend />
    </WhiskProvider>
  );
}
```

That's the entire integration.

### Add other ecosystems

Whisk mounts each ecosystem's stack only when its factory is present
in `wallets`, so EVM-only apps don't pay for Solana or Starknet code
they won't run.

```tsx
import { evm, solana, stellar, starknet } from "@usewhisk/react";

const config = createWhiskConfig({
  wallets: [evm(), solana(), stellar(), starknet()],
  chains: [
    "Base_Sepolia",
    "Solana_Devnet",
    "Stellar_Testnet",
    "Starknet_Sepolia",
  ],
});
```

### Custom theme via CSS variables

```css
[data-whisk] {
  --whisk-primary: 142 71% 45%;
  --whisk-radius: 0.75rem;
  --whisk-font: "Inter", system-ui, sans-serif;
}
```

---

## Features

| Capability               | Notes                                                                       |
| ------------------------ | --------------------------------------------------------------------------- |
| **Send (same-chain)**    | Direct ERC-20 (EVM), SPL (Solana), Stellar Asset (Stellar), or Cairo transfer (Starknet). |
| **Bridge (cross-chain)** | CCTP V2 Fast Transfer. Approve → burn → attestation → mint, all automatic. |
| **Cross-ecosystem**      | Every pair of the four ecosystems, both directions.                        |
| **Smart routing**        | Whisk picks same-chain vs bridge from the source/destination chains.       |
| **Multi-wallet**         | Ecosystem-first connect modal — EVM (wagmi connectors), Solana (Wallet Standard), Stellar (Stellar Wallets Kit), Starknet (get-starknet-core). |
| **Recipient resolvers**  | Address + ENSIP-11 multichain ENS built in; bring your own.                |
| **Fee transparency**     | Burn + forwarder + gas, displayed before confirm.                          |
| **Fee bearer**           | `feeBearer: "sender"` grosses up the burn so the recipient nets the exact amount; `"receiver"` deducts fees from the transfer. |
| **Progress streaming**   | Live step events over the whole `authorize → burn → attest → mint` lifecycle. |
| **Mid-flight recovery**  | Burn-but-no-mint failures: in-tab retry, cross-refresh persistence (localStorage, 48h), manual-mint via `MessageTransmitter.receiveMessage`. |
| **Mode-aware**           | `testnet` / `mainnet` first-class. Visible Testnet pill, Sepolia-first ENS, mode-namespaced persistence. |
| **Headless mode**        | `useWhisk()` hook for full UI control, or import `@usewhisk/core` for server flows. |
| **Theming**              | CSS variables (override `--whisk-*` for full rebrand) + optional Tailwind preset. |
| **Open source**          | MIT. Read every line, fork it, ship your own.                              |

---

## Architecture

Whisk is a small monorepo. Three packages, one architecture.

```
whisk/
├── packages/
│   ├── cctp/         # @usewhisk/cctp   — CCTP V2 protocol layer (chains, ABIs, Iris, builders)
│   ├── core/         # @usewhisk/core   — framework-agnostic engine
│   └── react/        # @usewhisk/react  — components, hooks, provider
├── examples/
│   ├── playground/         # Every-prop showcase + control panel
│   ├── ecommerce-checkout/ # Next.js storefront
│   ├── donate-button/      # Vite donation page
│   ├── themed-saas/        # Next.js dark dashboard
│   ├── payroll-batch/      # Vite batch payouts
│   ├── invoice-link/       # Next.js invoice links
│   ├── node-headless/      # Server-side scripts (send / payroll / refund)
│   └── vue-headless/       # Engine driving a Vue UI
└── apps/
    └── docs/         # Documentation site (Fumadocs)
```

- **`@usewhisk/cctp`** — CCTP V2 protocol layer. Chain registry
  (EVM + Solana + Stellar + Starknet), TokenMessengerV2 /
  MessageTransmitterV2 ABIs, Iris client, burn intent builders,
  manual mint builders. No engine logic, no UI.
- **`@usewhisk/core`** — the engine. Pure TypeScript, no React, no
  DOM. Exports `createWhisk()`, the adapter interfaces, the state
  machine, resolver composition, fee logic, and error classes.
- **`@usewhisk/react`** — components, hooks, and the provider. Wraps
  wagmi (EVM), Wallet Standard (Solana), Stellar Wallets Kit, and
  `get-starknet-core`. Ships `<WhiskSend>` (drop-in) and
  `useWhisk()` (headless).

Deeper design docs — engine boundary, state machine, fee model,
resolvers, errors — live on [the documentation site](https://www.usewhisk.xyz/docs).

---

## Recipes

Five reference integrations, each a themed mini-app. All run on
testnet — grab test USDC from the [Circle faucet](https://faucet.circle.com).

| Recipe                  | What it shows                                                       | Live demo                                                  |
| ----------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| **E-commerce checkout** | Cart total + merchant address locked; the widget is confirm-and-pay | [demo](https://whisk-ecommerce-checkout.vercel.app/)       |
| **Donate button**       | Pinned treasury + preset amounts that seed `defaultAmount`         | [demo](https://whisk-donate-button.vercel.app/)            |
| **Themed SaaS**         | `--whisk-*` overrides repaint the widget into a dark dashboard      | [demo](https://whisk-themed-saas.vercel.app/)              |
| **Payroll batch**       | Widget remounts per payee, bridging treasury USDC to each one's chain | [demo](https://whisk-payroll-batch.vercel.app/)          |
| **Invoice link**        | A shareable URL opens a pre-filled, locked checkout                | [demo](https://whisk-invoice-link.vercel.app/)             |

Two headless examples — `node-headless` for server flows and
`vue-headless` for a non-React UI — cover the engine-only path.

---

## Supported chains

CCTP V2 domains as of shipping v1:

| Ecosystem  | Testnet chain           | Mainnet chain     |
| ---------- | ----------------------- | ----------------- |
| **EVM**    | `Ethereum_Sepolia`      | `Ethereum`        |
|            | `Base_Sepolia`          | `Base`            |
|            | `Arbitrum_Sepolia`      | `Arbitrum`        |
|            | `Optimism_Sepolia`      | `Optimism`        |
|            | `Polygon_Amoy_Testnet`  | `Polygon`         |
|            | `Avalanche_Fuji`        | `Avalanche`       |
|            | `Linea_Sepolia`         | `Linea`           |
|            | `Unichain_Sepolia`      | `Unichain`        |
|            | `World_Chain_Sepolia`   | `World_Chain`     |
| **Solana** | `Solana_Devnet`         | `Solana`          |
| **Stellar** | `Stellar_Testnet`      | `Stellar`         |
| **Starknet** | `Starknet_Sepolia`    | `Starknet`        |

Adding a chain = a single new entry in
`packages/cctp/src/chains/` + `packages/core/src/chains/registry.ts`.

---

## Theming

Whisk ships with a default theme driven by `--whisk-*` CSS
variables on `[data-whisk]`. Override any of them in your own
stylesheet to retune the whole widget — light mode, dark mode,
accent, border radius, fonts, the lot.

```css
[data-whisk] {
  --whisk-bg: #f5f6fc;
  --whisk-fg: #1e1b4b;
  --whisk-fg-muted: #4f4d80;
  --whisk-border: #c0c4ea;
  --whisk-card: #ffffff;
  --whisk-primary: #6366f1;
  --whisk-primary-fg: #ffffff;
  --whisk-radius: 0.625rem;
  --whisk-font: "Inter", system-ui, sans-serif;
}

[data-whisk][data-whisk-theme="dark"] {
  --whisk-bg: #1a1c3d;
  --whisk-fg: #e2e2f5;
  /* … */
}
```

Tailwind users can opt into the preset:

```js
// tailwind.config.js
import { whiskTheme } from "@usewhisk/react/tailwind";

export default {
  presets: [whiskTheme()],
};
```

---

## Security model

- **No private keys ever touch Whisk.** The widget is browser-side; signing happens in the user's wallet.
- **No telemetry.** Nothing phones home.
- **Open source under MIT.** Audit every line. Fork it. Ship your own.
- **Type-safe end to end.** No `any` casts in the source. Every ecosystem's adapter is a discriminated union member.
- **Branch protection.** `main` is protected; every change goes through PR review including changes from the maintainer.
- **CodeQL on every PR.** Static analysis catches injection, XSS, prototype pollution, weak crypto, hardcoded credentials.
- **Live-tested on every CCTP V2 domain we ship.** Every ecosystem pair (EVM ↔ EVM, EVM ↔ Solana, EVM ↔ Stellar, EVM ↔ Starknet, Solana ↔ Stellar, Solana ↔ Starknet, Stellar ↔ Starknet) has been verified end-to-end on public testnet.

---

## Contributing

Whisk is community-maintained. Anyone can:

- File a bug or feature request → [open an issue](https://github.com/Signor1/whisk/issues)
- Improve the code → fork the repo, branch off `main`, open a pull request
- Improve the docs → same flow; small docs PRs are very welcome

Read [CONTRIBUTING.md](CONTRIBUTING.md) for development setup,
project layout, PR conventions, and the security-disclosure flow.

### Local development

```bash
git clone https://github.com/Signor1/whisk.git
cd whisk
pnpm install
pnpm -r build       # build all packages
pnpm -r typecheck   # strict type-check all packages
pnpm -r test        # run all package tests
```

---

## Acknowledgements

- Built directly on [Circle's CCTP V2](https://developers.circle.com/cctp) — the protocol doing the underlying settlement.
- Inspired by [Uniswap Widgets](https://github.com/Uniswap/widgets), [shadcn/ui](https://ui.shadcn.com/) for the theming approach, and [wagmi](https://wagmi.sh/) for the config-driven adapter pattern.
- Not affiliated with Circle in any official sense — Whisk is a community-built widget over Circle's public protocol.

---

## License

[MIT](LICENSE) · Built by [SignorDev](https://github.com/Signor1)
