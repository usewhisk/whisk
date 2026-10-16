# @usewhisk/cctp

CCTP V2 protocol layer for Whisk.

Direct integration with CCTP V2 contracts and Circle's Iris attestation
API across all four supported ecosystems: **EVM** (viem-typed
`TokenMessengerV2` / `MessageTransmitterV2` calls), **Solana**
(Anchor-encoded instructions), **Stellar** (Soroban invocations with
the `CctpForwarder` for inbound), and **Starknet** (Cairo `Call`
values with proper `ByteArray` encoding). Pure protocol builders and
HTTP client — no wallet state, no transaction submission. The engine
layer (`@usewhisk/core`) consumes this package and hands the resulting
calldata to a per-ecosystem wallet adapter.

## Install

```bash
pnpm add @usewhisk/cctp viem
```

`viem` is a peer-of-sorts: EVM ABIs are exported as `viem`-typed
const arrays. `@solana/web3.js`, `@stellar/stellar-sdk`, and
`starknet` are optional peer deps used only when you import the
matching ecosystem's builders.

## Quickstart

Build the calls for a Fast Transfer from Base mainnet to Arbitrum One:

```ts
import {
  Base,
  Arbitrum,
  getBurnFees,
  pickFeeTier,
  buildBurnIntent,
} from "@usewhisk/cctp";

const tiers = await getBurnFees(
  "mainnet",
  Base.cctpDomain,
  Arbitrum.cctpDomain,
);
const tier = pickFeeTier(tiers);

const intent = buildBurnIntent({
  source: Base,
  destination: Arbitrum,
  amount: 25_000_000n, // 25 USDC (6 decimals)
  mintRecipient: "0xabc...",
  fee: { tier, forwarderLevel: "med" },
});

// `intent.calls` is an ordered list of `{ to, data, value }` —
// hand to a wallet adapter to sign and submit.
```

## Polling for the attestation

Once the burn lands, Iris will publish a `messages[]` entry for the
source-chain tx. The forwarder picks it up on its own; you only need to
poll if you want to surface progress in the UI or fall back to a manual
mint.

```ts
import { pollMessages } from "@usewhisk/cctp";

const result = await pollMessages({
  network: "mainnet",
  sourceDomain: Base.cctpDomain,
  query: { transactionHash: burnTxHash },
  // Defaults stop polling once the first message has
  // `attestation !== "PENDING"`. Override `isDone` to wait for a
  // specific `forwardState` value.
});
```

## Manual mint (recovery)

If `forwardState === "FAILED"`, build the destination-chain
`receiveMessage` calldata yourself:

```ts
import { buildMintIntent } from "@usewhisk/cctp";

const mint = buildMintIntent({
  destination: Arbitrum,
  message: msg.message,
  attestation: msg.attestation,
});

// mint.call -> { to, data, value: 0n }
```

## What it does

- **Chain registry** — every EVM chain that supports CCTP V2 (mainnet +
  testnet), with USDC address, contract addresses, domain ID, default
  RPC URL, and Fast Transfer support flag.
- **Contract ABIs** — `TokenMessengerV2`, `MessageTransmitterV2`, USDC.
- **Iris API client** — fees, attestation fetch + poll, reattest.
- **Forwarder hookData** — the 32-byte magic bytes that trigger
  Circle's Orbit relayer to submit the destination mint.
- **Address encoding** — bytes32 left-pad for EVM mint recipients.
- **Fee math** — protocol fee (bps) + forwarder fee composition with
  optional buffer.
- **Burn intent builder** — `depositForBurnWithHook` calldata
  (forwarder on by default).
- **Manual mint builder** — `receiveMessage` calldata for recovery.

## What it does not do

- Send transactions. The engine hands calldata to a wallet adapter.
- Hold wallet state or signers.
- Cover non-EVM ecosystems. v1 is EVM-only.

## Error handling

Every failure mode throws a typed error in a single hierarchy rooted at
`CctpError`:

```ts
import {
  CctpError,
  InvalidInputError,
  IrisHttpError,
  IrisNetworkError,
  IrisAbortedError,
  ProtocolError,
  UnsupportedError,
  isCctpError,
} from "@usewhisk/cctp";

try {
  const intent = buildBurnIntent({ /* ... */ });
} catch (err) {
  if (err instanceof InvalidInputError) {
    // bad amount, bad address, identical source/destination, etc.
  } else if (err instanceof ProtocolError) {
    // amount above the 10M cap, Fast Transfer not supported, etc.
  } else if (isCctpError(err)) {
    // any other typed failure — inspect err.code
  }
}
```

`IrisHttpError` carries `status`, `bodySnippet`, and `url` for
debugging. `IrisAbortedError` is thrown when an `AbortSignal` cancels a
request. Use `err.code` for stable programmatic dispatch.

## Supported chains

| Chain      | Ecosystem | Mainnet | Testnet   | Domain | Fast |
| ---------- | --------- | ------- | --------- | ------ | ---- |
| Ethereum   | EVM       | yes     | Sepolia   | 0      | yes  |
| Avalanche  | EVM       | yes     | Fuji      | 1      | yes  |
| Optimism   | EVM       | yes     | Sepolia   | 2      | yes  |
| Arbitrum   | EVM       | yes     | Sepolia   | 3      | yes  |
| Solana     | Solana    | yes     | Devnet    | 5      | yes  |
| Base       | EVM       | yes     | Sepolia   | 6      | yes  |
| Polygon    | EVM       | yes     | Amoy      | 7      | yes  |
| Unichain   | EVM       | yes     | Sepolia   | 10     | yes  |
| Linea      | EVM       | yes     | Sepolia   | 11     | yes  |
| WorldChain | EVM       | yes     | Sepolia   | 14     | yes  |
| Starknet   | Starknet  | yes     | Sepolia   | 25     | yes  |
| Stellar    | Stellar   | yes     | Testnet   | 27     | yes  |

Whisk covers the four ecosystems it supports natively; Aptos, Sui,
Sei, Noble, Codex, and XRPL EVM are not built out yet but ride on the
same protocol layer if you need to add them.

## Live tests

Unit tests run on every commit. There's a separate live integration
suite that hits the real Iris sandbox; run it before publishing:

```bash
IRIS_LIVE=1 pnpm --filter @usewhisk/cctp test
```

## Status

v0.1 — under active development. API may change before v1.
