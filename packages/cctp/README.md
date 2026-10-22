# @usewhisk/cctp

CCTP V2 protocol layer for Whisk.

Direct integration with CCTP V2 contracts and Circle's Iris attestation
API across all four supported ecosystems: **EVM** (viem-typed
`TokenMessengerV2` / `MessageTransmitterV2` calls), **Solana**
(Anchor-encoded instructions), **Stellar** (Soroban invocations with
the `CctpForwarder` for inbound), and **Starknet** (Cairo `Call`
values with proper `ByteArray` encoding). Pure protocol builders and
HTTP client: no wallet state, no transaction submission. The engine
layer (`@usewhisk/core`) consumes this package and hands the resulting
calldata to a per-ecosystem wallet adapter.

## Install

```bash
pnpm add @usewhisk/cctp
```

`viem`, `@solana/web3.js`, `@stellar/stellar-sdk` and `starknet` are
direct dependencies. EVM ABIs are exported as `viem`-typed const arrays.

The chain registry, ABIs and Iris client are also available on their
own as `@usewhisk/cctp/chains`, `@usewhisk/cctp/abi` and
`@usewhisk/cctp/iris`.

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
const tier = pickFeeTier(tiers, "fast");

const intent = buildBurnIntent({
  source: Base,
  destination: Arbitrum,
  amount: 25_000_000n, // 25 USDC (6 decimals)
  mintRecipient: "0xabc...",
  fee: { tier, forwarderLevel: "med" },
});

// intent.calls: ordered { to, data, value } for the wallet to sign.
```

## Polling for the attestation

Once the burn lands, Iris publishes a message for the source-chain tx.
Circle's forwarder picks it up on its own; you only need to poll if you
want to show progress or fall back to a manual mint.

```ts
import { pollMessages } from "@usewhisk/cctp";

const msg = await pollMessages(
  { sourceDomain: Base.cctpDomain, transactionHash: burnTxHash },
  { network: "mainnet" },
);
```

By default polling stops once the forwarder has minted or failed, or,
for a burn without the forwarder, once the attestation is complete.
Pass `isDone` to choose your own condition. It resolves to `null` if
Iris has nothing by the timeout.

## Manual mint (recovery)

If `msg.forwardState === "FAILED"`, build the destination-chain
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

`buildMintIntent` is for EVM destinations. Use
`buildSolanaReceiveIntent`, `buildStellarMintIntent` or
`buildStarknetReceiveIntent` for the others.

## What it does

- **Chain registry:** every chain that supports CCTP V2 on EVM, Solana,
  Stellar and Starknet (mainnet and testnet), with USDC address,
  contract addresses, domain, default RPC URLs and capability flags.
- **Contract ABIs:** `TokenMessengerV2`, `MessageTransmitterV2`, USDC.
- **Iris API client:** fees, signed upfront-fee quotes, message fetch
  and poll, reattest, with a shared rate limiter.
- **Forwarder hookData:** the magic bytes that ask Circle's forwarder
  to submit the destination mint.
- **Address encoding:** bytes32 mint recipients for every ecosystem.
- **Fee math:** protocol fee (bps) plus forwarder fee, with optional
  buffers.
- **Burn builders:** `buildBurnIntent` and `buildBurnWithFeesIntent`
  (EVM), `buildSolanaBurnIntent`, `buildStellarBurnIntent`,
  `buildStarknetBurnIntent`. The forwarder is on by default.
- **Mint builders:** `receiveMessage` calldata for recovery on every
  ecosystem.

## What it does not do

- Send transactions. The engine hands calldata to a wallet adapter.
- Hold wallet state or signers.

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
  const intent = buildBurnIntent(input);
} catch (err) {
  if (err instanceof InvalidInputError) {
    // bad amount, bad address, identical source and destination
  } else if (err instanceof ProtocolError) {
    // amount above the 10M cap, Fast Transfer not offered on the source
  } else if (isCctpError(err)) {
    // any other typed failure: inspect err.code
  }
}
```

`IrisHttpError` carries `status`, `bodySnippet`, and `url` for
debugging. `IrisRateLimitedError` carries `retryAt`. `IrisAbortedError`
is thrown when an `AbortSignal` cancels a request. Use `err.code` for
stable programmatic dispatch.

## Supported chains

Chain ids are strings such as `Base_Sepolia`. `getChain(id)` returns the
entry, and `CHAINS` lists them all. "Fast source" means Circle offers Fast
Transfer for burns from that chain; on the others, Circle's standard
attestation is the only option. "Forwarding" means Circle's Forwarding Service
can mint on that chain.

| Chain       | Mainnet id    | Testnet id             | Domain | Fast source | Forwarding |
| ----------- | ------------- | ---------------------- | ------ | ----------- | ---------- |
| Ethereum    | `Ethereum`    | `Ethereum_Sepolia`     | 0      | yes         | yes        |
| Avalanche   | `Avalanche`   | `Avalanche_Fuji`       | 1      | no          | yes        |
| OP Mainnet  | `Optimism`    | `Optimism_Sepolia`     | 2      | yes         | yes        |
| Arbitrum    | `Arbitrum`    | `Arbitrum_Sepolia`     | 3      | yes         | yes        |
| Base        | `Base`        | `Base_Sepolia`         | 6      | yes         | yes        |
| Polygon PoS | `Polygon`     | `Polygon_Amoy_Testnet` | 7      | no          | yes        |
| Unichain    | `Unichain`    | `Unichain_Sepolia`     | 10     | yes         | yes        |
| Linea       | `Linea`       | `Linea_Sepolia`        | 11     | yes         | yes        |
| Codex       | `Codex`       | `Codex_Testnet`        | 12     | yes         | yes        |
| Sonic       | `Sonic`       | `Sonic_Testnet`        | 13     | no          | yes        |
| World Chain | `World_Chain` | `World_Chain_Sepolia`  | 14     | yes         | yes        |
| Monad       | `Monad`       | `Monad_Testnet`        | 15     | no          | yes        |
| Sei         | `Sei`         | `Sei_Testnet`          | 16     | no          | yes        |
| XDC         | `XDC`         | `XDC_Apothem`          | 18     | no          | yes        |
| HyperEVM    | `HyperEVM`    | `HyperEVM_Testnet`     | 19     | no          | yes        |
| Ink         | `Ink`         | `Ink_Testnet`          | 21     | yes         | yes        |
| Plume       | `Plume`       | `Plume_Testnet`        | 22     | yes         | yes        |
| Arc         | `Arc`         | `Arc_Testnet`          | 26     | no          | yes        |
| EDGE        | `Edge`        | `Edge_Testnet`         | 28     | yes         | yes        |
| Injective   | `Injective`   | `Injective_Testnet`    | 29     | no          | no         |
| Morph       | `Morph`       | `Morph_Testnet`        | 30     | yes         | no         |
| Pharos      | `Pharos`      | `Pharos_Testnet`       | 31     | no          | no         |
| Cronos      | `Cronos`      | `Cronos_Testnet`       | 32     | no          | no         |
| Plasma      | `Plasma`      | `Plasma_Testnet`       | 33     | no          | no         |
| X Layer     | `X_Layer`     | `X_Layer_Testnet`      | 37     | yes         | no         |
| Solana      | `Solana`      | `Solana_Devnet`        | 5      | yes         | yes        |
| Stellar     | `Stellar`     | `Stellar_Testnet`      | 27     | no          | no         |
| Starknet    | `Starknet`    | `Starknet_Sepolia`     | 25     | yes         | no         |

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

v0.1, under active development. The API may change before v1.

## Links

- **Source:** <https://github.com/usewhisk/whisk/tree/main/packages/cctp>
- **Issues:** <https://github.com/usewhisk/whisk/issues>
