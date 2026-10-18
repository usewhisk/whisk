---
date: 2026-10-17
feature: Whisk v1, rebuilt on direct CCTP V2
scope: feat
scenario-impact: needs_automation
---

# Whisk v1 on direct CCTP V2

Whisk moves USDC by calling Circle's CCTP V2 contracts directly, through the new
`@usewhisk/cctp` package, instead of going through App Kit. Payers can send from and
to Stellar and Starknet as well as EVM chains and Solana. The widget gains receipts,
refunds, webhooks and theming, and new headless examples show the engine without the
widget.

Removed: App Kit, the swap tab and user-controlled wallets.

Technical shape, per
[ADR-2026-10-16-phase-1-foundation](../adr/ADR-2026-10-16-phase-1-foundation.md):

- Layering is `cctp`, then `core`, then `react`, then the examples.
- The packages need no app ID. `appId` and `cloudBaseUrl` are gone from
  `createWhiskConfig`, along with `useWhiskCloud` and the Whisk protocol-fee row in
  `WhiskSend`. A handshake that verifies its token returns in Phase 2.
- The hosted console is not part of this repo. It moves to `usewhisk/platform`.
- `createWhisk` takes an optional `fetch`, used for every Iris request, and the Iris
  functions in `@usewhisk/cctp` take one too. Pass one to route Iris through a proxy
  or to stub Circle in tests.
- One chain registry, in `@usewhisk/cctp`. It covers 25 EVM chains plus Solana,
  Stellar and Starknet, each on mainnet and testnet, with Arc among them. Chain ids
  are Circle App Kit `Blockchain` strings (`Base_Sepolia`, `Arc_Testnet`), and core's
  `Chain` type is the union of those ids. Each entry carries its native currency,
  USDC decimals and Circle's capability flags (`fastSource`,
  `forwardingDestination`, `upfrontFeeSource`).
- Core's lookups are replaced by the registry's: `chainInfo` by `getChain`,
  `chainByEvmId` by `chainByEvmChainId` and `tryChainByEvmChainId`, `allChains` by
  `CHAINS`, and an entry's `kind` by its `ecosystem`. `addressFormat(chain)` gives
  the input pattern and hint. `cctpDomainFor`, `chainForCctpDomain`, `chainsByKind`,
  `supportedTokensFor` and `tokenAddressFor` are removed; every chain now has a
  domain (`getChain(chain).cctpDomain`).
- Receipts and recovery now find Stellar (domain 27) and Starknet (domain 25) burns
  on Iris.
- Core's old table pointed Ink and Plume at Stargate's bridged `USDC.e` and Codex at
  an address with no contract. The registry uses Circle's native USDC on all three.
- `pnpm --filter @usewhisk/cctp check:registry` reads every EVM entry back from
  its public RPCs and fails on any mismatch. It runs nightly in `registry.yml`.
- Fee maths is exact and rounds up. `parseFeeBps` reads Iris's `minimumFee` from its
  decimal text into hundredths of a basis point (`1.3` is `130n`), and
  `computeBurnFee(amount, feeCentiBps)` takes that bigint and rounds the fee up, as
  does the forwarder buffer. Before, `maxFee` could come out one subunit short, which
  turns a Fast transfer into a Standard one.
- `BurnFeeTier.minimumFee` and the `forwardFee` levels are bigints.
  `sumProtocolFees` and `sumForwarderFees` return bigint subunits, and quote totals
  are summed in bigints.
- A test fails the build if `parseFloat`, `Number(`, `toFixed(` or `Math.ceil`,
  `floor` or `round` appears in a `fees`, `engine` or `quote` source path.
- A transfer's network comes from its source chain. `mode` is gone from
  `createWhisk` and `createWhiskConfig`, along with `inferMode`, `resolveMode` and
  `WhiskMode`, so a config may list mainnet and testnet chains together. A source and
  destination on different networks throw `NetworkMismatchError` before Iris is
  called, and the widget offers only destinations on the source chain's network.
- `planRoute` decides each bridge before anything is signed: its network, whether
  Circle forwards the mint or a connected wallet signs it, and which wallets that
  needs. `quote` and `send` both go through it. A missing wallet throws
  `RouteUnavailableError` with `reason: "destination_adapter_required"` and the
  ecosystem to connect. `QuoteParams` takes `destinationAdapter`, so a quote can
  check it too.
- Circle forwards only to EVM chains flagged `forwardingDestination`, and only for
  burns from EVM and Solana. Elsewhere the mint is signed by a wallet. Before, a
  transfer to Morph, Injective, Pharos, Cronos, Plasma or X Layer was burned with
  forwarding hook data that Circle ignores, and stalled until someone minted it.
- Solana to EVM with forwarding off mints with the connected EVM wallet. Before, it
  burned and then failed.
- The default resolver picks Sepolia or mainnet ENS from the destination chain's
  network.
- `.gitleaks.toml` allows public Stellar and EVM addresses and the fixture webhook
  secrets in tests, which gitleaks reads as generic API keys.

This note is updated as each Phase 1 step lands on the branch. The testnet matrix
from Step 10 is the automation this release still needs.
