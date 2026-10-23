# @usewhisk/core

[![npm version](https://img.shields.io/npm/v/@usewhisk/core?style=flat-square&color=10b981)](https://www.npmjs.com/package/@usewhisk/core)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@usewhisk/core?style=flat-square&label=bundle)](https://bundlephobia.com/package/@usewhisk/core)
[![types](https://img.shields.io/badge/types-TypeScript-3178c6?style=flat-square)](https://www.typescriptlang.org/)
[![license MIT](https://img.shields.io/badge/license-MIT-yellow?style=flat-square)](./LICENSE)

Framework-agnostic engine that powers the Whisk USDC widget. No
React, no wagmi, no wallet-adapter dependencies: just the state
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
});
const recipient = await engine.resolve(
  "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
  "Ethereum_Sepolia",
);
const quote = await engine.quote({
  sourceChain: "Base_Sepolia",
  destinationChain: "Ethereum_Sepolia",
  recipient,
  amount: "10",
  adapter,
});
const result = await engine.send({ quote, adapter });
```

> **Status:** tested on testnet across all four ecosystems (EVM,
> Solana, Stellar, Starknet). Mainnet and testnet use the same API;
> the network comes from the chains you pass.

## Install

```bash
pnpm add @usewhisk/core viem
```

`viem` is a peer dependency. `@usewhisk/cctp` ships as a direct
dependency. This is where the protocol layer lives (chain registry,
ABIs, Iris client, burn and mint builders across EVM, Solana,
Stellar, Starknet).

## Runtime support

`@usewhisk/core` runs on Node 20+, Deno, Bun, Cloudflare Workers,
and Vercel Edge / Fluid Compute. Almost every export is universal:
the engine, fees, chains, errors, resolvers, metadata, refund,
webhook, settlement-status (`deriveReceiptView`), Iris polling, and
manual mint helpers all work anywhere `fetch` exists.

In-flight transfers live in the `inflightStore` you pass to
`createWhisk`. The default keeps them in memory; `createStorageInflightStore`
takes any Web Storage object, such as `localStorage` in a browser.

The webhook primitives (`signWebhook` / `verifyWebhook`) need
`globalThis.crypto.subtle`, which is available on every supported
runtime out of the box.

## Quick tour

```ts
import { createWhisk, addressResolver, composeResolvers } from "@usewhisk/core";

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
  // The default. Use "receiver" to deduct the bridge fees from the transfer.
  feeBearer: "sender",
  appLabel: "my-checkout",
});

// 1. Resolve free-text recipient input.
const recipient = await engine.resolve(
  "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
  "Ethereum_Sepolia",
);

// 2. Quote a transfer (same-chain or cross-chain, auto-routed).
const quote = await engine.quote({
  sourceChain: "Base_Sepolia",
  destinationChain: "Ethereum_Sepolia",
  recipient,
  amount: "10",
  adapter, // see "Building an adapter" below
});

// 3. Send the quote the payer confirmed, with per-step progress.
const result = await engine.send(
  { quote, adapter },
  { onStep: (step) => console.log(step.name, step.state) },
);

if (result.kind === "success") {
  console.log("final tx:", result.finalTxHash);
} else {
  console.error(result.error.code, result.error.message);
}
```

`send` takes the chains, recipient and amounts from the quote. It
throws `QuoteExpiredError` once the quote is past `expiresAt`, and
`QuoteChangedError` (carrying the fresh `quote`) if fees rose past what
the payer confirmed. Nothing is signed in either case.

## Engine surface

`createWhisk(config)` returns a `WhiskEngine`:

```ts
interface WhiskEngine {
  readonly config: WhiskConfig;
  resolve(input: string, chain: Chain): Promise<ResolvedRecipient>;
  quote(params: QuoteParams): Promise<Quote>;
  send(params: SendParams, listeners?: SendListeners): Promise<SendResult>;
  balance(params: { chain: Chain; address: string }): Promise<bigint | null>;
  maxSendable(params: Omit<QuoteParams, "amount">): Promise<MaxSendable | null>;
  inflight(): Promise<readonly InflightRecord[]>;
  dismiss(id: string): Promise<void>;
  resume(
    record: InflightRecord,
    options?: ResumeOptions,
    listeners?: SendListeners,
  ): Promise<SendResult>;
  resumeFromTx(
    params: ResumeFromTxParams,
    listeners?: SendListeners,
  ): Promise<SendResult>;
  refund(
    params: RefundParams,
    listeners?: SendListeners,
  ): Promise<RefundResult>;
}
```

`SendResult` is `SendSuccess | SendFailure`, a discriminated union:
branch on `result.kind` and TypeScript narrows the rest of the shape.

`balance` and `maxSendable` read EVM USDC balances and return `null`
elsewhere. Bridges are recorded in the `inflightStore` from the moment
the burn is signed. After a reload, `inflight()` lists them and
`resume(record)` finishes one without signing the burn again;
`resumeFromTx({ sourceChain, txHash })` does the same from a burn hash.

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

Each interface is small. Here's the EVM shape:

```ts
interface EvmAdapter {
  readonly kind: "evm";
  readonly address: `0x${string}`;
  getChainId(): Promise<number>;
  switchChain(chainId: number): Promise<void>;
  sendCalls(
    calls: EvmCall[],
    options?: SendCallsOptions,
  ): Promise<SendCallsResult>;
  waitForReceipt(hash: `0x${string}`): Promise<CallReceipt>;
}
```

Wrap whatever you have (a wagmi connector, a viem `WalletClient`, a
Node signing key) into this shape and pass it to `engine.quote` and
`engine.send`. The React package builds these for you via
`useEvmAdapter()`, `useSolanaAdapter()`, `useStellarAdapter()`,
`useStarknetAdapter()`.

For server-side flows, see
[`examples/node-headless`](https://github.com/usewhisk/whisk/tree/main/examples/node-headless)
for a runnable viem-backed adapter.

## Cross-ecosystem: the destination adapter

Circle's forwarder submits the mint only for burns from EVM or Solana
into an EVM chain that supports forwarding. Every other bridge (into
Solana, Stellar or Starknet, out of Stellar or Starknet, or into an EVM
chain without forwarding) needs a wallet to sign the mint on the
destination. Pass it as `destinationAdapter` to both `quote` and
`send`. For an EVM to EVM mint, the source adapter signs it.

```ts
const quote = await engine.quote({ ...params, adapter, destinationAdapter });
await engine.send({ quote, adapter, destinationAdapter });
```

Without it, `quote` throws `RouteUnavailableError` with
`reason: "destination_adapter_required"`.

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
  resolve: async (input, { chain }) => {
    const address = await lookupEns(input);
    return address ? { address, chain, displayName: input } : null;
  },
};

const resolver = composeResolvers([addressResolver, ensResolver]);
```

Resolvers run in order; the first non-null match wins. Throws are
tagged with the resolver's name for clean error reporting.

## Errors

Every error is a `WhiskError` or subclass. `quote` and `send` throw
when they refuse before anything is signed; once the wallet is
involved, `send` returns `{ kind: "failure", error }`. Branch on
`code` in your UI:

| Code                   | Class                      | Retryable |
| ---------------------- | -------------------------- | --------- |
| `NO_ADAPTER`           | `NoAdapterError`           | no        |
| `WRONG_CHAIN`          | `WrongChainError`          | yes       |
| `INSUFFICIENT_BALANCE` | `InsufficientBalanceError` | no        |
| `INVALID_ADDRESS`      | `InvalidAddressError`      | no        |
| `RESOLVER_FAILED`      | `ResolverError`            | yes       |
| `BRIDGE_STEP_FAILED`   | `BridgeStepError`          | yes       |
| `USER_REJECTED`        | `UserRejectedError`        | yes       |
| `NETWORK_ERROR`        | `NetworkError`             | yes       |
| `WALLET_CAPABILITY`    | `WalletCapabilityError`    | no        |
| `ONCHAIN_REVERT`       | `OnchainRevertError`       | no        |
| `CONFIG_ERROR`         | `ConfigError`              | no        |
| `NETWORK_MISMATCH`     | `NetworkMismatchError`     | no        |
| `ROUTE_UNAVAILABLE`    | `RouteUnavailableError`    | no        |
| `QUOTE_EXPIRED`        | `QuoteExpiredError`        | yes       |
| `QUOTE_CHANGED`        | `QuoteChangedError`        | yes       |
| `UNKNOWN`              | `WhiskError`               | no        |

`RouteUnavailableError.reason` is one of `same_chain`,
`source_adapter_required`, `destination_adapter_required`,
`recipient_account_missing` (a Solana recipient without a USDC account,
or a Stellar one without a USDC trustline) or `recipient_not_deployed`
(a Starknet address with no account deployed). For the last, ask the
payer to confirm the address is their own new wallet, then quote again
with `allowUndeployedRecipient: true`. The connected Starknet wallet's
own address never needs the confirmation.

A Starknet recipient that fits in 20 bytes is refused with
`InvalidAddressError`, since it is almost always an Ethereum address
pasted by mistake.
`NetworkMismatchError` means the source and destination are not both
mainnet or both testnet.

`toWhiskError(unknown)` wraps any thrown value into the right
subclass. Drop it in a top-level try/catch and you always get a
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

getChain("Base_Sepolia").label; // "Base Sepolia"
chainsByNetwork("testnet").length; // every supported testnet
chainByEvmChainId(8453).id; // "Base"
explorerTxUrl("Solana_Devnet", "sig123"); // includes ?cluster=devnet
```

The registry lives in `@usewhisk/cctp`; core re-exports it, and `Chain` is
the union of its ids.

## Type-safe everywhere

Every chain, token, and event payload is a real TypeScript union.
Typos fail the build, not the user:

```ts
import type { Chain, Token } from "@usewhisk/core";

const chain: Chain = "Base_Sepolia";
const token: Token = "USDC";

const bad: Chain = "Mainnet";
// Type '"Mainnet"' is not assignable to type 'Chain'.
```

## Testing

```bash
pnpm --filter @usewhisk/core test
```

Covers the engine routes, state machine, resolvers, address
resolvers per ecosystem, fee math, routing, error mapping, chain
registry, and recovery primitives.

## Docs and examples

- **Full docs:** <https://www.usewhisk.xyz/docs>
- **React widget:** [`@usewhisk/react`](https://www.npmjs.com/package/@usewhisk/react)
- **CCTP protocol layer:** [`@usewhisk/cctp`](https://www.npmjs.com/package/@usewhisk/cctp)
- **Source:** <https://github.com/usewhisk/whisk>
- **Issues:** <https://github.com/usewhisk/whisk/issues>

## License

MIT © [SignorDev](https://github.com/Signor1). Issues and PRs welcome.
