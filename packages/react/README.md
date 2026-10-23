# @usewhisk/react

[![npm version](https://img.shields.io/npm/v/@usewhisk/react?style=flat-square&color=10b981)](https://www.npmjs.com/package/@usewhisk/react)
[![types](https://img.shields.io/badge/types-TypeScript-3178c6?style=flat-square)](https://www.typescriptlang.org/)
[![license MIT](https://img.shields.io/badge/license-MIT-yellow?style=flat-square)](./LICENSE)

Drop-in React widget for USDC payments and cross-chain bridges. One
component handles wallet connect, recipient resolution, fee preview,
and the full transaction lifecycle. Speaks EVM, Solana, Stellar, and
Starknet natively, including bridges between them. Built directly on
[Circle's CCTP V2](https://developers.circle.com/cctp), powered by
[`@usewhisk/core`](https://www.npmjs.com/package/@usewhisk/core).

```tsx
<WhiskProvider config={config}>
  <WhiskSend />
</WhiskProvider>
```

> **Status:** tested on testnet across all four ecosystems. The API
> doesn't change between testnet and mainnet: the network comes from
> the chain ids you pass to `createWhiskConfig`.

## Install

```bash
pnpm add @usewhisk/react @tanstack/react-query viem
```

(`npm install`, `yarn add`, and `bun add` work the same way.)

### Peer dependencies

| Peer                    | Range         |
| ----------------------- | ------------- |
| `react`                 | `>=18`        |
| `react-dom`             | `>=18`        |
| `@tanstack/react-query` | `>=5`         |
| `viem`                  | `>=2.57.5 <3` |

`wagmi`, `@usewhisk/core`, and the Solana, Stellar and Starknet wallet
libraries ship as direct dependencies. Each ecosystem's provider is
mounted only when its factory is in `config.wallets`. See
[Ecosystems](#ecosystems) below.

If you already use wagmi in your app, Whisk reuses an outer
`<WagmiProvider>` automatically, with no double mount.

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
      chains: ["Base_Sepolia", "Ethereum_Sepolia"],
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
        onSuccess={({ finalTxHash }) => console.log("paid:", finalTxHash)}
      />
    </WhiskProvider>
  );
}
```

`evm({ chains })` lists the EVM chains the wallet can switch to. Without
it the wallet gets `Arc_Testnet`, `Ethereum_Sepolia` and `Base_Sepolia`.

Same-chain sends and CCTP V2 cross-chain bridges share a single UI
flow: connect, input, review, progress. The Send tab moves USDC on one
chain; the Bridge tab moves it across chains. The payer sends exactly
the quote shown on the review screen. The widget refreshes a quote
before it expires, and if fees rise at send time it shows the new quote
to confirm. When the balance is known, a
Max button fills in the largest amount the wallet can send after fees.

## Surface

### Components

| Export            | What it is                                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<WhiskProvider>` | Provider stack: wagmi + react-query + (opt-in) Solana / Stellar / Starknet contexts + Whisk context. Detects and reuses an outer `<WagmiProvider>` / `<QueryClientProvider>`. |
| `<WhiskSend>`     | The full inline widget, with Send and Bridge tabs.                                                                                                                            |
| `<WhiskReceipt>`  | Settlement status for a transfer, polled from Iris, with a button to finish a bridge that has not minted.                                                                     |
| `<ResumeList>`    | Bridges that were burned but not yet minted (for example after the tab closed), each with a way to finish or dismiss it. `<WhiskSend>` already includes it.                   |
| `<ConnectModal>`  | The wallet picker on its own (`open`, `onOpenChange`). Reach for it when you want to launch connection outside the widget.                                                    |

### Hooks

```ts
import {
  useWhisk, // engine, connected EVM wallet, quote and send
  useWhiskContext, // raw provider context (config, engine, theme)
  useWhiskEngine, // the engine on its own
  useEvmAdapter, // EvmAdapter for the connected EVM wallet
  useSolanaAdapter,
  useStellarAdapter,
  useStarknetAdapter,
  useReceipt, // poll for receipt / attestation status
  useRefund, // fire a refund from React
} from "@usewhisk/react";
```

`useWhisk()` returns the `engine`, the connected EVM `adapter`,
`address` and `isConnected`, the `resolve`, `quote`, `send` and
`reset` actions, and send state (`isSending`, `lastResult`,
`sendError`). Build custom UI or background flows on the same engine.
For other ecosystems, pass the matching adapter hook's result to
`engine.quote` and `engine.send` directly.

### `<WhiskSend>` props

The widget supports both **controlled** and **default** patterns.
A prop you pass directly locks that field: the user's edits are
ignored. `default*` variants prefill the field but leave it editable.

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
  tabs={["send", "bridge"]} // default
  // tabs={["bridge"]}       // bridge-only surface
  title="Send USDC"
  // Lifecycle:
  onSuccess={({ finalTxHash, steps }) => {}}
  onFailure={({ error, steps }) => {}}
/>
```

Locking recipient, amount and chains suits invoice, subscription, or
one-product checkout flows where the payer only reviews and pays.

### Who pays the bridge fees

By default (`feeBearer: "sender"`) Whisk sizes the burn up by the
estimated CCTP and Forwarder fees, so the recipient nets the full
amount and the sender's debit grows to cover them. Set
`feeBearer: "receiver"` to deduct the fees from the transfer instead,
so a $50 transfer arrives a little short.

```tsx
const config = createWhiskConfig({
  wallets: [evm({ chains: ["Base_Sepolia", "Arbitrum_Sepolia"], projectId })],
  chains: ["Base_Sepolia", "Arbitrum_Sepolia"],
  feeBearer: "receiver", // default is "sender"
});
```

The review screen shows both figures ("Recipient gets" and "You
pay"). See the [fees guide](https://www.usewhisk.xyz/docs/concepts/fees)
for the full breakdown and the accuracy caveat on variable gas.

To charge your own flat fee on top, set
`feePolicy: { value: "0.25", recipient: "0x..." }`. The payer pays it on
top of the transfer; 90% goes to `recipient` and 10% to the Whisk
treasury (`WHISK_TREASURY_ADDRESS`).

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

No CSS, no components: just the providers, the config helpers, and
the engine hooks. Same engine, your UI.

### Errors

Errors are typed `WhiskError` subclasses re-exported from
`@usewhisk/core`, such as `InsufficientBalanceError`,
`RouteUnavailableError` (with a `reason` such as
`recipient_account_missing`) and `NetworkMismatchError`. Branch on
`error.code`, which also covers `QUOTE_EXPIRED` and `QUOTE_CHANGED`.

`<WhiskSend>` handles `recipient_not_deployed` itself: it asks the payer
to confirm a Starknet address with no account deployed before it quotes
the transfer. A custom UI quotes again with `allowUndeployedRecipient:
true` once the payer confirms.
See the [core README](https://www.npmjs.com/package/@usewhisk/core#errors)
for the full table.

## Ecosystems

Add each ecosystem you want to accept by including its factory in
`config.wallets`. Whisk mounts each ecosystem's provider stack only
when its factory is present, and every pair of ecosystems can bridge
in both directions.

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

`solana()`, `stellar()` and `starknet()` default to their test networks.
For mainnet pass `solana({ network: "mainnet-beta" })`,
`stellar({ network: "public" })` or `starknet({ network: "mainnet" })`.
A bridge that Circle does not forward (anything into Solana, Stellar or
Starknet, for example) needs a wallet connected on the destination too;
the widget tells the payer to connect it.

**On Vite with Solana:** `@solana/web3.js` needs Node's `Buffer`
global, which Vite doesn't shim. Add a one-line polyfill at the top
of your entry file or the first Solana operation throws
`Buffer is not defined`. Next.js handles this automatically. See
the [install guide](https://www.usewhisk.xyz/docs/getting-started/install#vite--solana-polyfill-buffer).

## Theming

Pick a theme on the provider. `"light"` is the default; `"dark"`,
`"wine"`, `"indigo"`, `"emerald"` and `"monochrome"` are the other
presets, and `"auto"` follows `prefers-color-scheme` in CSS alone, so it
is safe to render on the server.

```tsx
<WhiskProvider config={config} theme="auto">
  {children}
</WhiskProvider>
```

Every visual property is a `--whisk-*` CSS variable on `[data-whisk]`.
Change them with `tokens`:

```tsx
<WhiskProvider
  config={config}
  theme={{
    preset: "light",
    tokens: { primary: "#b04f3e", radius: "0.625rem" },
  }}
>
  {children}
</WhiskProvider>
```

With `"light"`, `"dark"` or `"auto"` you can also override any variable in
your own stylesheet, loaded after `styles.css`. The other presets set their
colors inline, so use `tokens` to change those.

```css
[data-whisk] {
  --whisk-radius-md: 0.625rem;
  --whisk-font: "Inter", system-ui, sans-serif;
}
```

A Tailwind preset maps the variables to utility classes such as
`bg-whisk-primary`:

```ts
// tailwind.config.ts
import { whiskTheme } from "@usewhisk/react/tailwind";

export default {
  presets: [whiskTheme()],
};
```

## SSR / Next.js App Router

Theme resolution needs no `window.matchMedia` call, so there is no
hydration flash. For the widget itself, load it client-side via
`next/dynamic` so wagmi and the wallet adapters don't try to initialise
during prerender:

```tsx
"use client";
import dynamic from "next/dynamic";

const WhiskSend = dynamic(
  () => import("@usewhisk/react").then((m) => m.WhiskSend),
  { ssr: false },
);
```

See the [`playground` example](https://github.com/usewhisk/whisk/tree/main/examples/playground)
for a complete setup.

## BYO wagmi / QueryClient

Already running wagmi or react-query in your app? Drop
`<WhiskProvider>` anywhere inside your existing tree and it reuses
them. `createWhiskConfig` still needs at least one wallet factory;
with an outer `<WagmiProvider>`, the `evm()` factory's own wagmi config
is not used.

```tsx
<QueryClientProvider client={myClient}>
  <WagmiProvider config={myWagmi}>
    <WhiskProvider
      config={createWhiskConfig({
        wallets: [evm()],
        chains: ["Arbitrum"],
      })}
    >
      <WhiskSend />
    </WhiskProvider>
  </WagmiProvider>
</QueryClientProvider>
```

## Subpath exports

| Import path                  | What you get                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `@usewhisk/react`            | Full surface: components, hooks, config helpers.                                           |
| `@usewhisk/react/headless`   | Provider + config + engine hooks. No UI.                                                   |
| `@usewhisk/react/styles.css` | The default theme. Required for the bundled components.                                    |
| `@usewhisk/react/tailwind`   | Tailwind preset (`whiskTheme`) that maps `--whisk-*` to utility classes.                   |
| `@usewhisk/react/fonts.css`  | Optional Inter, Familjen Grotesk and Geist Mono font faces, for apps that don't load them. |

## Docs and examples

- **Full docs:** <https://www.usewhisk.xyz/docs>
- **Live playground:** <https://whisk-playground.vercel.app>
- **Examples in the repo:** [`examples/`](https://github.com/usewhisk/whisk/tree/main/examples)
  (e-commerce checkout, donate button, themed SaaS, payroll batch,
  invoice link, plus `node-headless` and `vue-headless`)

## License

MIT © [SignorDev](https://github.com/Signor1). Source on
[GitHub](https://github.com/usewhisk/whisk). Issues and PRs welcome at
<https://github.com/usewhisk/whisk/issues>.
