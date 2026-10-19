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
- Chains without Fast Transfer bridge as Standard instead of being refused: Arc,
  Avalanche, Polygon, Sonic, Monad, Sei, XDC, HyperEVM, Injective, Pharos, Cronos,
  Plasma and Stellar. On these chains Standard attests in about half a second to
  ten seconds. `RoutePlan` carries `speed` and `etaSeconds`, Circle's published
  attestation time for the source, and bridge quotes carry their `plan`.
  `attestationSeconds(chain, speed)` in `@usewhisk/cctp` returns that table.
- `getBurnFees` keeps Iris's Standard row, and `pickFeeTier(tiers, speed)` takes
  the speed. Every burn builder takes its finality threshold from the fee tier:
  `minFinalityThreshold` is required on the Solana, Stellar and Starknet builders,
  and the EVM builder refuses a Fast tier on a chain without Fast.
- A quote is what the payer signs
  ([ADR-2026-10-18-bound-quotes-and-fees](../adr/ADR-2026-10-18-bound-quotes-and-fees.md)).
  - `Quote` has an `id`, `issuedAt`, `expiresAt` (60 seconds), `feeMode` and
    bigint `subunits`.
  - `send({ quote, adapter, destinationAdapter?, metadata? })` reads the chains,
    recipient and amount from the quote, and burns with exactly
    `quote.subunits.maxFee` and `burnAmount`. Before, `send` fetched fees again
    and could sign a different `maxFee` from the one shown (#87).
  - An expired quote throws `QuoteExpiredError` (`QUOTE_EXPIRED`). If fresh Iris
    fees no longer fit under the quote's `maxFee`, `send` throws
    `QuoteChangedError` (`QUOTE_CHANGED`) carrying the fresh quote. Both happen
    before anything is signed.
  - `WhiskSend` fetches a new quote before the old one expires. When fees rise,
    it shows the old and new totals and asks the payer to confirm again.
  - `buildBurnIntent` takes `fee.maxFee` and burns with it as given.
- Fast burns carry a 10% buffer on the protocol fee in `maxFee`. Circle takes
  only the fee it executes, and the quote's protocol line shows the most it can
  be. Before, a small fee rise could quietly turn a Fast transfer into a Standard
  one.
- Circle's forwarding fee defaults to the `high` level, or `med` into Ethereum,
  where `high` costs about 0.30 USDC more. `createWhisk({ forwarderFeeLevel })`
  overrides it.
- Registry entries carry `standardFeeSwitch`, true where TokenMessengerV2 has
  `getMinFeeAmount` (14 mainnets and their testnets, plus Sonic Testnet). A
  Standard quote from those chains reads it with `getStandardMinFee` and never
  charges less. `check:registry` checks the flag nightly.
- On the 18 chains with Circle's `TokenMessengerWithFees`, a transfer whose sender
  pays the fees pays them upfront from Circle's signed quote, and the recipient
  gets exactly the amount sent. The quote's `feeMode` is `upfront`.
  - The quote shows the most the fee can be: the Fast fee plus 10% and the
    forwarding fee at the configured level.
  - At send time the engine fetches Circle's signed quote, priced in USDC. If
    the signed fee is above the shown fee, `send` throws `QuoteChangedError`.
    An expired signed quote is fetched once more before `QuoteExpiredError`.
  - The burn is `depositForBurnWithFees`, approved for the amount plus the
    shown fee.
  - Receiver-pays transfers, Stellar destinations, and Standard burns that owe
    an on-chain minimum stay on `maxFee`.
- `@usewhisk/cctp` adds:
  - `getSignedBurnQuote`, `getFastBurnAllowance` and `getBlockNumber`;
  - `buildBurnWithFeesIntent` and `tokenMessengerWithFeesAbi`;
  - `tokenMessengerWithFees` on each `upfrontFeeSource` registry entry, which
    `check:registry` reads back nightly.
- A Fast route whose amount exceeds Circle's remaining Fast allowance is
  planned as Standard, with the Standard ETA, at quote time and again at send.
- `reattest(nonce)` sends `POST /v2/reattest/{nonce}` and returns Circle's
  acknowledgement, `{ nonce }`. Before, it sent `GET`, which Iris does not
  serve (#66).
- Every Iris request goes through one rate limiter per process, at 30 requests
  a second per host, under Circle's 35.
  - A 429 makes that host stand down for five minutes, as Circle blocks the IP
    for that long. Calls in the meantime throw `IrisRateLimitedError` with
    `retryAt` instead of asking again.
  - `pollMessages` waits a stand-down out without counting it against its
    timeout, and reports it through `onRateLimited`.
  - `createIrisLimiter` makes a separate limiter, passed as `limiter`.
- Attestation polling is sized to the route's expected time:
  - every 2 seconds when Circle's time is a minute or less, every 10 seconds up
    to 30 minutes, every 30 seconds beyond that;
  - for twice the expected time plus five minutes.

  Before, every route polled every 3 seconds and gave up at 15 minutes, which
  is shorter than a Standard transfer from Ethereum, Linea or Starknet.
  `pollBudget(eta)` returns the numbers.
- A relayed mint counts as done once Iris reports it `CONFIRMED` or `COMPLETE`
  with its `forwardTxHash` (`isForwardDone`). Before, `send` waited for
  `COMPLETE` alone.
- Iris's message types match what it sends. `status` is `complete` or
  `pending_confirmations`, as Iris never reports a failed attestation, and
  `delayReason` is one of `insufficient_fee`, `amount_above_max` or
  `insufficient_allowance_available`: reasons a message is slow, not failures.
- Every bridge is kept in an `InflightStore` from before the wallet signs until
  the mint (#86).
  - `createWhisk({ inflightStore })` takes the store. Core's default is
    memory, `createStorageInflightStore(storage)` keeps records under
    `whisk:inflight:<id>` in any Web Storage object, and `WhiskProvider` uses
    `localStorage` by default (`createBrowserInflightStore`).
  - A record is written as `signing` before the wallet is asked, `burned` with
    the burn hash the moment the wallet returns it, then `attested` and
    `minted`. A transfer that never burned leaves no record. Burned records
    never expire.
  - `SendListeners.onBurnSubmitted(txHash)` reports the burn hash before any
    receipt wait. Before, an EVM source reported it only after the approve
    receipt, so a tab closed in between lost a burned transfer.
- `engine.inflight()` lists the records. `engine.resume(record, {
  destinationAdapter })` finishes one without signing the burn again.
  - It checks the burn did not revert, waits for the attestation, and checks
    that the attestation's destination matches.
  - For a forwarded transfer it waits for Circle's relayer, and mints itself
    only if the relayer failed.
  - Before minting it reads `usedNonces` on the destination, so a transfer
    that was already received is marked minted without a second mint.
  - An expired attestation is re-attested by `POST`, then re-read by nonce.
    On Arbitrum, EDGE and Plume, which count expiry in L1 blocks, the mint is
    tried first and re-attested only if it reverts.
  - It resumes into Solana, Stellar and Starknet as well, minting with the
    destination wallet. Before minting it checks the destination has not
    received the message: the `used_nonce` account on Solana, and
    `is_nonce_used` on Stellar and Starknet. An expired attestation is
    re-attested if the mint reverts, since those chains count expiry in slots
    and ledgers the wallets do not report alike.
  - Before any mint, the attested bytes are checked against the record: the
    destination domain and the amount burned.
- `engine.resumeFromTx({ sourceChain, txHash, destinationAdapter })` does the
  same from the burn's tx hash alone, building the record from what Iris
  decoded.
- `@usewhisk/cctp` adds `isNonceUsed`, `isStellarNonceUsed`,
  `isStarknetNonceUsed` and `getTransactionStatus`, and `decodeBurnMessage`,
  which reads a CCTP V2 burn message's fields from its bytes.
- Core's receipt client (`fetchAttestationOnce`, `pollAttestation`,
  `IrisStatus`) and `useReceipt` drop the `failed` status Iris never sends; a
  status other than `complete` is still pending.
- Removed: `engine.retry`, which only threw "not implemented", and
  `RetryParams`. Also removed are the browser snapshot helpers
  (`saveInflight`, `loadInflight`, `clearInflight`, `listInflightSnapshots`,
  `serializeError`, `deserializeError`, `INFLIGHT_TTL_MS`, `STORAGE_PREFIX`,
  `InflightSnapshot`, `WalletKind`), which nothing called and which expired
  burned transfers after 48 hours.
- Arc rules (#71):
  - Every EVM call the engine sends on Arc carries `maxFeePerGas`, a quarter
    above Arc's `eth_gasPrice` and never under its 20 gwei floor, plus a 1 gwei
    `maxPriorityFeePerGas`. Arc drops an offer under the floor, which left the
    payer waiting on a transaction that would never mine. Other chains leave
    fees to the wallet.
  - `EvmCall` has optional `maxFeePerGas` and `maxPriorityFeePerGas`, which
    adapters pass to the wallet when set.
  - JSON-RPC reads retry `-32014`, which Arc's load-balanced endpoint returns
    from a backend behind the head.
  - `WhiskProvider`'s wagmi config uses viem's `arc` and `arcTestnet`, adding
    Arc mainnet. Before, Arc Testnet pointed at `rpc.testnet.arc.network`,
    which no longer resolves.
  - Arc is the default chain in the examples.
  - The Next examples load Inter, Familjen Grotesk and JetBrains Mono from
    `woff2` files in the repo, with each font's OFL licence, through
    `next/font/local`. `next/font/google` fetched them during `next build` and
    failed CI whenever Google's reply did not parse.
- `viem` is a peer dependency of `@usewhisk/core` and `@usewhisk/react`, at
  `>=2.57.5 <3`, and a dependency of `@usewhisk/cctp` in the same range. 2.57.5
  is the first release whose Arc chains carry Arc's current RPCs.
- `EvmAdapter.sendCalls(calls, { onSubmitted })` reports each hash as the
  wallet returns it, before any receipt wait. The engine saves the burn hash
  from it (#86). `useEvmAdapter` reports them, and waits for a second
  confirmation before a call that depends on the one before, so a
  load-balanced RPC one block behind cannot estimate a burn against the
  allowance from before its approve. `createWagmiEvmAdapter(config, address)`
  is the same adapter outside a hook.
- The default resolver picks Sepolia or mainnet ENS from the destination chain's
  network.
- `addressResolver` accepts an address of any ecosystem it knows: EVM, Solana
  base58, Stellar `G`, `M` and `C` strkeys, and Starknet felts. Before, it
  matched only EVM and Solana, so the widget refused a Stellar or Starknet
  recipient (#65). `looksLikeAddress` exposes the check.
- Widget errors are visible (#89).
  - A send that throws shows its message in the form, with its code in
    `data-whisk-error`, instead of becoming an unhandled rejection.
  - A wallet that fails to disconnect is reported in the connect dialog,
    which stays open. Before, the error was dropped and the dialog closed.
- The chain picker's list and the connect dialog render into a container
  inside `[data-whisk]`, which `WhiskProvider` mounts, so they keep the
  widget's styles and theme. Before, they rendered unstyled at the end of
  `body` (#69).
- The widget has DOM tests (Testing Library on jsdom) that mount the real
  components, and a test fails on an unhandled rejection.
- `.gitleaks.toml` allows public Stellar and EVM addresses and the fixture webhook
  secrets in tests, which gitleaks reads as generic API keys.

This note is updated as each Phase 1 step lands on the branch. The testnet matrix
from Step 10 is the automation this release still needs.
