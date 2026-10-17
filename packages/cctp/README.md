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

Chain ids are Circle App Kit `Blockchain` strings. `getChain(id)` returns the
entry, and `CHAINS` lists them all. "Fast source" means Circle offers Fast
Transfer for burns from that chain; on the others, Circle's standard
attestation is the only option. "Forwarding" means Circle's Forwarding Service
can mint on that chain.

| Chain | Mainnet id | Testnet id | Domain | Fast source | Forwarding |
| --- | --- | --- | --- | --- | --- |
| Ethereum | `Ethereum` | `Ethereum_Sepolia` | 0 | yes | yes |
| Avalanche | `Avalanche` | `Avalanche_Fuji` | 1 | no | yes |
| OP Mainnet | `Optimism` | `Optimism_Sepolia` | 2 | yes | yes |
| Arbitrum | `Arbitrum` | `Arbitrum_Sepolia` | 3 | yes | yes |
| Base | `Base` | `Base_Sepolia` | 6 | yes | yes |
| Polygon PoS | `Polygon` | `Polygon_Amoy_Testnet` | 7 | no | yes |
| Unichain | `Unichain` | `Unichain_Sepolia` | 10 | yes | yes |
| Linea | `Linea` | `Linea_Sepolia` | 11 | yes | yes |
| Codex | `Codex` | `Codex_Testnet` | 12 | yes | yes |
| Sonic | `Sonic` | `Sonic_Testnet` | 13 | no | yes |
| World Chain | `World_Chain` | `World_Chain_Sepolia` | 14 | yes | yes |
| Monad | `Monad` | `Monad_Testnet` | 15 | no | yes |
| Sei | `Sei` | `Sei_Testnet` | 16 | no | yes |
| XDC | `XDC` | `XDC_Apothem` | 18 | no | yes |
| HyperEVM | `HyperEVM` | `HyperEVM_Testnet` | 19 | no | yes |
| Ink | `Ink` | `Ink_Testnet` | 21 | yes | yes |
| Plume | `Plume` | `Plume_Testnet` | 22 | yes | yes |
| Arc | `Arc` | `Arc_Testnet` | 26 | no | yes |
| EDGE | `Edge` | `Edge_Testnet` | 28 | yes | yes |
| Injective | `Injective` | `Injective_Testnet` | 29 | no | no |
| Morph | `Morph` | `Morph_Testnet` | 30 | yes | no |
| Pharos | `Pharos` | `Pharos_Testnet` | 31 | no | no |
| Cronos | `Cronos` | `Cronos_Testnet` | 32 | no | no |
| Plasma | `Plasma` | `Plasma_Testnet` | 33 | no | no |
| X Layer | `X_Layer` | `X_Layer_Testnet` | 37 | yes | no |
| Solana | `Solana` | `Solana_Devnet` | 5 | yes | yes |
| Stellar | `Stellar` | `Stellar_Testnet` | 27 | no | no |
| Starknet | `Starknet` | `Starknet_Sepolia` | 25 | yes | no |

`pnpm --filter @usewhisk/cctp check:registry` reads each EVM entry back from
its public RPCs: chain id, `localDomain()`, the TokenMessenger's transmitter,
and the USDC symbol and decimals.

## Live tests

Unit tests run on every commit. There's a separate live integration
suite that hits the real Iris sandbox; run it before publishing:

```bash
IRIS_LIVE=1 pnpm --filter @usewhisk/cctp test
```

## Status

v0.1 — under active development. API may change before v1.
