# @usewhisk/react

[![npm version](https://img.shields.io/npm/v/@usewhisk/react?style=flat-square&color=10b981)](https://www.npmjs.com/package/@usewhisk/react)
[![types](https://img.shields.io/badge/types-TypeScript-3178c6?style=flat-square)](https://www.typescriptlang.org/)
[![license MIT](https://img.shields.io/badge/license-MIT-yellow?style=flat-square)](./LICENSE)

Drop-in React widget for USDC payments and cross-chain bridges. One
component handles wallet connect, recipient resolution, fee preview,
and the full transaction lifecycle. Speaks EVM, Solana, Stellar, and
Starknet natively. Built directly on
[Circle's CCTP V2](https://developers.circle.com/cctp), powered by
[`@usewhisk/core`](https://www.npmjs.com/package/@usewhisk/core).

```tsx
<WhiskProvider config={config}>
  <WhiskSend />
</WhiskProvider>
```

> **Status:** Live-tested on testnet across all four ecosystems.
> Mainnet support is next. The API doesn't change between testnet
> and mainnet — only the chain identifiers you pass to
> `createWhiskConfig`.

## Install

```bash
pnpm add @usewhisk/react @tanstack/react-query
```

(`npm install`, `yarn add`, and `bun add` work the same way.)

### Peer dependencies

| Peer                    | Range   |
| ----------------------- | ------- |
| `react`                 | `>=18`  |
| `react-dom`             | `>=18`  |
| `@tanstack/react-query` | `>=5`   |

`wagmi`, `viem`, `@usewhisk/core`, and `@usewhisk/cctp` ship as
direct dependencies. Non-EVM ecosystems (Solana, Stellar, Starknet)
add their own optional peer packages that you install only when you
enable the matching ecosystem in `config.wallets`. See
[Ecosystems](#ecosystems) below.

If you already use wagmi in your app, Whisk reuses an outer
`<WagmiProvider>` automatically — no double-mount.

## Quickstart

```tsx
"use client";

import {
  WhiskProvider,
  WhiskSend,
  createWhiskConfig,
  evm,
} from "@usewhisk/react";
import "@usewhisk/react/styles.css";

const config = createWhiskConfig({
  wallets: [
    evm({
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
      appName: "My App",
    }),
  ],
  chains: ["Base_Sepolia", "Ethereum_Sepolia"],
  defaultSourceChain: "Base_Sepolia",
  defaultDestinationChain: "Ethereum_Sepolia",
  appLabel: "my-app",
});

export function Checkout() {
  return (
    <WhiskProvider config={config}>
      <WhiskSend
        amount="49.99"
        recipient="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1"
        onSuccess={({ finalTxHash }) =>
          console.log("paid:", finalTxHash)
        }
      />
    </WhiskProvider>
  );
}
```

Same-chain sends and CCTP V2 cross-chain bridges share a single UI
flow: connect → input → review → progress. The widget picks the tab
(Send or Bridge) based on the source/destination chains you choose.

## Surface

### Components

| Export             | What it is                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `<WhiskProvider>`  | Provider stack — wagmi + react-query + (opt-in) Solana / Stellar / Starknet contexts + Whisk context. Detects and reuses an outer `<WagmiProvider>` / `<QueryClientProvider>`. |
| `<WhiskSend>`      | The full inline widget — Send and Bridge tabs.                                                 |
| `<ConnectModal>`   | The wallet picker on its own. Reach for it when you want to launch connection outside the widget. |
| `<AccountChip>` / `<NetworkPill>` | Header-friendly status elements you can drop anywhere in your app shell. |

### Hooks

```ts
import {
  useWhisk,             // engine state + actions
  useWhiskContext,      // raw provider context (config, engine, theme)
  useEvmAdapter,        // builds a WhiskAdapter for the connected EVM wallet
  useSolanaAdapter,     // …for Solana
  useStellarAdapter,    // …for Stellar
  useStarknetAdapter,   // …for Starknet
  useReceipt,           // poll for receipt / attestation status
  useRefund,            // fire a refund from React
} from "@usewhisk/react";
```

`useWhisk()` returns the engine's state machine plus the action
callbacks (`resolve`, `quote`, `send`, `reset`). Every transition
(`idle`, `resolving`, `quoting`, `reviewing`, `sending`, `success`,
`failed`) surfaces here so you can build telemetry, custom UI, or
background flows on the same engine.

### `<WhiskSend>` props

The widget supports both **controlled** and **default** patterns.
Any prop you pass directly is treated as the source of truth — the
corresponding field becomes read-only in the UI. `default*` variants
prefill the field but leave it editable.

```tsx
<WhiskSend
  // Controlled (locks the field):
  amount="49.99"
  recipient="alice.eth"
  sourceChain="Base_Sepolia"
  destinationChain="Ethereum_Sepolia"

  // Or prefill but leave editable:
  defaultAmount="49.99"
  defaultRecipient="alice.eth"
  defaultSourceChain="Base_Sepolia"
  defaultDestinationChain="Ethereum_Sepolia"

  // Restrict which tabs are visible:
  tabs={["send", "bridge"]}          // default
  // tabs={["bridge"]}                // bridge-only surface

  // Lifecycle:
  onSuccess={({ finalTxHash, steps }) => …}
  onFailure={({ error, steps }) => …}
/>
```

When recipient + amount + chains are all controlled, the widget
short-circuits to a confirm-only surface — useful for invoice,
subscription, or one-product checkout flows.

### Who pays the bridge fees

By default the recipient absorbs the CCTP and Forwarder fees, so a
$50 transfer arrives a little short. For checkout, payroll, and
invoice flows where the recipient needs an exact figure, set
`feeBearer: "sender"` on the config. Whisk then sizes the burn up
by the estimated fees so the recipient nets the full amount and the
sender's debit grows to cover them.

```tsx
const config = createWhiskConfig({
  wallets: [evm({ projectId })],
  chains: ["Base_Sepolia", "Arbitrum_Sepolia"],
  feeBearer: "sender", // default is "receiver"
});
```

The review screen reflects it: "Recipient gets $50.00 · You pay
$50.30". See the [fees guide](https://www.usewhisk.xyz/docs/concepts/fees)
for the full breakdown and the accuracy caveat on variable gas.

### Headless entry

If you don't want any of the bundled UI, import from the
`/headless` subpath:

```ts
import {
  WhiskProvider,
  createWhiskConfig,
  evm,
  solana,
  stellar,
  starknet,
  useWhisk,
  useEvmAdapter,
} from "@usewhisk/react/headless";
```

No CSS, no components — just the providers, the config helpers, and
the engine hooks. Same engine, your UI.

## Ecosystems

Add each ecosystem you want to accept by including its factory in
`config.wallets`. Whisk mounts each ecosystem's provider stack only
when its factory is present — EVM-only apps don't pay for Solana or
Starknet code they won't run.

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

Per-ecosystem peer packages (install only when you enable that
ecosystem):

```bash
# Solana
pnpm add @solana/wallet-adapter-react @solana/wallet-adapter-base

# Stellar
pnpm add @creit.tech/stellar-wallets-kit

# Starknet
pnpm add @starknet-io/get-starknet-core starknet
```

**On Vite with Solana:** `@solana/web3.js` needs Node's `Buffer`
global, which Vite doesn't shim. Add a one-line polyfill at the top
of your entry file or the first Solana operation throws
`Buffer is not defined`. Next.js handles this automatically. See
the [install guide](https://www.usewhisk.xyz/docs/getting-started/install#vite-solana-polyfill-buffer).

## Theming

Every visual property routes through a CSS variable scoped to
`[data-whisk]`. Override the tokens you care about in your own
stylesheet:

```css
[data-whisk] {
  --whisk-bg: #fbf6ee;
  --whisk-fg: #221d1a;
  --whisk-primary: #b04f3e;
  --whisk-radius-md: 0.625rem;
  /* … */
}
```

No Tailwind plugin, no CSS-in-JS runtime. Dark mode tracks
`@media (prefers-color-scheme: dark)` by default; pin it explicitly
on the provider:

```tsx
<WhiskProvider config={config} theme="light" />     // or "dark" / "auto"
```

A Tailwind preset is also available:

```ts
// tailwind.config.ts
import whiskPreset from "@usewhisk/react/tailwind";

export default {
  presets: [whiskPreset],
  content: ["./node_modules/@usewhisk/react/dist/**/*.{js,cjs}"],
};
```

## SSR / Next.js App Router

Theme resolution is CSS-only — no `window.matchMedia` call, no
hydration flash. For the widget itself, load it client-side via
`next/dynamic` so wagmi and wallet-adapter don't try to initialise
during prerender:

```tsx
"use client";
import dynamic from "next/dynamic";

const WhiskSend = dynamic(
  () => import("@usewhisk/react").then((m) => m.WhiskSend),
  { ssr: false },
);
```

See the [`playground` example](https://github.com/Signor1/whisk/tree/main/examples/playground)
for a complete setup.

## BYO wagmi / QueryClient

Already running wagmi or react-query in your app? Drop
`<WhiskProvider>` anywhere inside your existing tree and it reuses
them:

```tsx
<QueryClientProvider client={myClient}>
  <WagmiProvider config={myWagmi}>
    <WhiskProvider
      config={createWhiskConfig({
        wallets: [],        // no evm() needed — outer wagmi covers it
        chains: ["Arbitrum"],
      })}
    >
      <WhiskSend />
    </WhiskProvider>
  </WagmiProvider>
</QueryClientProvider>
```

## Subpath exports

| Import path                   | What you get                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `@usewhisk/react`             | Full surface — components, hooks, config helpers.                                                |
| `@usewhisk/react/headless`    | Provider + config + engine hooks. No UI.                                                         |
| `@usewhisk/react/styles.css`  | The default theme. Required for the bundled components.                                          |
| `@usewhisk/react/tailwind`    | Tailwind preset that maps `--whisk-*` to utility classes.                                        |
| `@usewhisk/react/fonts.css`   | Optional Inter font face — opt in when your app doesn't already load Inter.                      |

## Docs and examples

- **Full docs:** <https://www.usewhisk.xyz/docs>
- **Live playground:** <https://whisk-playground.vercel.app>
- **Examples in the repo:** [`examples/`](https://github.com/Signor1/whisk/tree/main/examples)
  (e-commerce checkout, donate button, themed SaaS, payroll batch,
  invoice link, plus `node-headless` and `vue-headless`)

## License

MIT © [SignorDev](https://github.com/Signor1). Source on
[GitHub](https://github.com/Signor1/whisk). Issues and PRs welcome.
