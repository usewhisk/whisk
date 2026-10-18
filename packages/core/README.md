# @usewhisk/core

[![npm version](https://img.shields.io/npm/v/@usewhisk/core?style=flat-square&color=10b981)](https://www.npmjs.com/package/@usewhisk/core)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@usewhisk/core?style=flat-square&label=bundle)](https://bundlephobia.com/package/@usewhisk/core)
[![types](https://img.shields.io/badge/types-TypeScript-3178c6?style=flat-square)](https://www.typescriptlang.org/)
[![license MIT](https://img.shields.io/badge/license-MIT-yellow?style=flat-square)](./LICENSE)

Framework-agnostic engine that powers the Whisk USDC widget. No
React, no wagmi, no wallet-adapter dependencies — just the state
machine, per-ecosystem adapter interfaces, resolvers, chain
registry, fees, and error model. Built directly on
[`@usewhisk/cctp`](https://www.npmjs.com/package/@usewhisk/cctp) for
the CCTP V2 protocol layer.

> **Most apps want [`@usewhisk/react`](https://www.npmjs.com/package/@usewhisk/react) instead.**
> Reach for `@usewhisk/core` directly when you're building a Whisk
> frontend outside React, running engine logic on a server, or
> writing tests that don't pull in a wallet adapter.

```ts
const engine = createWhisk({
  chains: ["Base_Sepolia", "Ethereum_Sepolia"],
  mode: "testnet",
});
const recipient = await engine.resolve("alice.eth", "Ethereum_Sepolia");
const quote = await engine.quote({ ..., recipient, amount: "10" });
const result = await engine.send({ ..., quote, adapter });
```

> **Status:** Live-tested on testnet across all four ecosystems.
> Mainnet support is next.

## Install

```bash
pnpm add @usewhisk/core @usewhisk/cctp
```

`@usewhisk/cctp` ships as a direct dependency. This is where the
protocol layer lives (chain registry, ABIs, Iris client, burn +
mint builders across EVM, Solana, Stellar, Starknet).

## Runtime support

`@usewhisk/core` runs on Node 20+, Deno, Bun, Cloudflare Workers,
and Vercel Edge / Fluid Compute. Almost every export is universal —
the engine, fees, chains, errors, resolvers, metadata, refund,
webhook, settlement-status (`deriveReceiptView`), Iris polling, and
manual mint helpers all work anywhere `fetch` exists.

The one exception is the `localStorage`-backed mid-flight recovery
snapshot helpers (`saveInflight` / `loadInflight` / `clearInflight` /
`listInflightSnapshots`). They read and write `window.localStorage`,
so on the server they return `null` / `false` without throwing.

The webhook primitives (`signWebhook` / `verifyWebhook`) need
`globalThis.crypto.subtle`, which is available on every supported
runtime out of the box.

## Quick tour

```ts
import {
  createWhisk,
  addressResolver,
  composeResolvers,
} from "@usewhisk/core";

const engine = createWhisk({
  chains: [
    "Base_Sepolia",
    "Ethereum_Sepolia",
    "Solana_Devnet",
    "Stellar_Testnet",
    "Starknet_Sepolia",
  ],
  defaultSourceChain: "Base_Sepolia",
  resolver: composeResolvers([addressResolver]),
  // "sender" grosses up the burn so the recipient nets the exact amount.
  // Default "receiver" deducts the bridge fees from the transfer.
  feeBearer: "sender",
  appLabel: "my-checkout",
});

// 1. Resolve free-text recipient input.
const recipient = await engine.resolve(
  "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
  "Ethereum_Sepolia",
);

// 2. Quote a transfer (same-chain or cross-chain — auto-routed).
const quote = await engine.quote({
  sourceChain: "Base_Sepolia",
  destinationChain: "Ethereum_Sepolia",
  recipient,
  amount: "10",
  adapter, // see "Building an adapter" below
});

// 3. Send, with per-step progress callbacks.
const result = await engine.send(
  {
    recipient,
    amount: "10",
    sourceChain: "Base_Sepolia",
    destinationChain: "Ethereum_Sepolia",
    adapter,
    quote,
  },
  { onStep: (step) => console.log(step.name, step.state) },
);

if (result.kind === "success") {
  console.log("final tx:", result.finalTxHash);
} else {
  console.error(result.error.code, result.error.message);
}
```

## Engine surface

`createWhisk(config)` returns a `WhiskEngine`:

```ts
interface WhiskEngine {
  readonly config: WhiskConfig;
  resolve(input: string, chain: Chain): Promise<ResolvedRecipient>;
  quote(params: QuoteParams): Promise<Quote>;
  send(params: SendParams, listeners?: SendListeners):
    Promise<SendSuccess | SendFailure>;
  refund(params: RefundParams, listeners?: SendListeners):
    Promise<SendSuccess | SendFailure>;
}
```

The `SendSuccess | SendFailure` return type is a discriminated union
— branch on `result.kind` and TypeScript narrows the rest of the
shape.

## Building an adapter

An adapter is the bridge between Whisk's engine and your wallet
layer. Whisk defines four adapter interfaces, one per ecosystem, and
picks the right one for the source chain automatically:

```ts
import type {
  EvmAdapter,
  SolanaAdapter,
  StellarAdapter,
  StarknetAdapter,
  WhiskAdapter,
} from "@usewhisk/core";
```

Each interface is small (5–6 methods). Here's the EVM shape:

```ts
interface EvmAdapter {
  readonly kind: "evm";
  readonly address: `0x${string}`;
  getChainId(): Promise<number>;
  switchChain(chainId: number): Promise<void>;
  sendCalls(calls: EvmCall[]): Promise<SendCallsResult>;
  waitForReceipt(hash: `0x${string}`): Promise<CallReceipt>;
}
```

Wrap whatever you have — a wagmi connector, a viem `WalletClient`, a
Node signing key — into this shape and pass it to `engine.send`. The
React package builds these for you via `useEvmAdapter()`,
`useSolanaAdapter()`, `useStellarAdapter()`, `useStarknetAdapter()`.

For server-side flows, see
[`examples/node-headless`](https://github.com/Signor1/whisk/tree/main/examples/node-headless)
for a runnable viem-backed adapter.

## Cross-ecosystem: the destination adapter

Bridges to non-EVM destinations (Solana, Stellar, Starknet) need a
`destinationAdapter` on `engine.send` to sign the mint on the target
chain, because Circle's Iris auto-forwarder only relays to EVM. For
EVM→EVM and Solana→EVM, the Forwarder auto-mints and
`destinationAdapter` is unused.

```ts
await engine.send({
  ...,
  adapter,             // signs the burn on the source
  destinationAdapter,  // signs the mint on Stellar / Starknet / Solana
});
```

## Resolvers

The engine resolves free-text recipient input through a chain of
`Resolver` objects. The default chain just contains
`addressResolver` (EVM hex + Solana base58 + Stellar strkey +
Starknet felt). Add ENS, email, handle, or any custom lookup by
composing:

```ts
import {
  addressResolver,
  composeResolvers,
  type Resolver,
} from "@usewhisk/core";

const ensResolver: Resolver = {
  name: "ens",
  matches: (input) => input.endsWith(".eth"),
  resolve: async (input, chain) => /* your lookup */,
};

const resolver = composeResolvers([addressResolver, ensResolver]);
```

Resolvers run in order; the first non-null match wins. Throws are
tagged with the resolver's name for clean error reporting.

## Errors

Every failure path returns a `WhiskError` or subclass. Branch on
`code` in your UI:

| Code                    | Class                       | Retryable |
| ----------------------- | --------------------------- | --------- |
| `NO_ADAPTER`            | `NoAdapterError`            | no        |
| `WRONG_CHAIN`           | `WrongChainError`           | yes       |
| `INSUFFICIENT_BALANCE`  | `InsufficientBalanceError`  | no        |
| `INVALID_ADDRESS`       | `InvalidAddressError`       | no        |
| `RESOLVER_FAILED`       | `ResolverError`             | yes       |
| `BRIDGE_STEP_FAILED`    | `BridgeStepError`           | yes       |
| `USER_REJECTED`         | `UserRejectedError`         | yes       |
| `NETWORK_ERROR`         | `NetworkError`              | yes       |
| `WALLET_CAPABILITY`     | `WalletCapabilityError`     | no        |
| `ONCHAIN_REVERT`        | `OnchainRevertError`        | no        |
| `CONFIG_ERROR`          | `ConfigError`               | no        |
| `UNKNOWN`               | `WhiskError`                | no        |

`toWhiskError(unknown)` wraps any thrown value into the right
subclass — drop it in a top-level try/catch and you always get a
typed error back.

## Chain registry

```ts
import {
  CHAINS,
  chainByEvmChainId,
  chainsByNetwork,
  explorerTxUrl,
  getChain,
} from "@usewhisk/core";

getChain("Base_Sepolia").label;             // "Base Sepolia"
chainsByNetwork("testnet").length;          // every supported testnet
chainByEvmChainId(8453).id;                 // "Base"
explorerTxUrl("Solana_Devnet", "sig123");   // includes ?cluster=devnet
```

The registry lives in `@usewhisk/cctp`; core re-exports it, and `Chain` is
the union of its ids.

## Type-safe everywhere

Every chain, token, and event payload is a real TypeScript union.
Typos fail the build, not the user:

```ts
import type { Chain, Token } from "@usewhisk/core";

const chain: Chain = "Base_Sepolia"; // ✓
const token: Token = "USDC";         // ✓

const bad: Chain = "Mainnet";
//                   ^^^^^^^^^
// Type '"Mainnet"' is not assignable to type 'Chain'.
```

## Testing

```bash
pnpm --filter @usewhisk/core test
```

271 tests across 27 files — the engine, state machine, resolvers,
address resolvers per ecosystem, fee math, routing, error mapping,
chain registry, and recovery primitives. Runs in under 3 s.

## Docs and examples

- **Full docs:** <https://www.usewhisk.xyz/docs>
- **React widget:** [`@usewhisk/react`](https://www.npmjs.com/package/@usewhisk/react)
- **CCTP protocol layer:** [`@usewhisk/cctp`](https://www.npmjs.com/package/@usewhisk/cctp)
- **Source:** <https://github.com/Signor1/whisk>

## License

MIT © [SignorDev](https://github.com/Signor1). Issues and PRs welcome.
