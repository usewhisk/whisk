# Plan: Phase 1, Foundation (2026-10-16)

Status: approved by the maintainer on 2026-10-17.

ADR: `docs/adr/ADR-2026-10-16-phase-1-foundation.md`, approved by the maintainer on
2026-10-16.

## Boundaries

- **Change:**
  - `packages/cctp`, `packages/core`, `packages/react`;
  - `examples/*`;
  - `scripts/` and `.github/workflows/`.
- **Remove from the branch:**
  - `apps/console`: its source stays recoverable at `2add7d6` and is ported in
    `usewhisk/platform` #3;
  - `packages/react/src/cloud`;
  - the protocol-fee display in `WhiskSend`.
- **Untouched:** `apps/docs`, until `docs.usewhisk.xyz` serves the ported content.
- **Layering stays downward:** `cctp`, then `core`, then `react`, then examples. Core
  gains no React import, and cctp gains no core import.

### Workflow

- `feat/v1-cctp-rebuild` (PR #57) is the integration branch. It is first rebased onto
  `main` (`77df734`).
- Each step below is its own PR into `feat/v1-cctp-rebuild`, cut from it in its own
  worktree. The maintainer reviews it in a readable size.
- PR #57 merges into `main` once, at the end.

## Interfaces

### `@usewhisk/cctp`

```ts
export type Ecosystem = "evm" | "solana" | "stellar" | "starknet";
export type Network = "mainnet" | "testnet";

export interface ChainCapabilities {
  fastSource: boolean;
  forwardingDestination: boolean;
  upfrontFeeSource: boolean;
}

interface ChainBase {
  id: string; // App Kit Blockchain string: "Arc", "Arc_Testnet", "Base_Sepolia"
  label: string;
  network: Network;
  cctpDomain: number;
  usdcDecimals: 6 | 7;
  nativeCurrency: { symbol: string; decimals: number };
  defaultRpcUrls: readonly string[];
  explorerUrl: string;
  capabilities: ChainCapabilities;
}
// EvmChain, SolanaChain, StellarChain and StarknetChain extend ChainBase with the
// contract fields they already carry today.

export const CHAINS: readonly CctpChain[];
export type ChainId = (typeof CHAINS)[number]["id"];
export function getChain(id: ChainId): CctpChain; // throws UnknownChainError
export function chainByDomain(domain: number, network: Network): CctpChain;
export function chainByEvmChainId(id: number): EvmChain;

export function parseFeeBps(raw: unknown): bigint; // hundredths of a bp, throws on bad shape
export function computeBurnFee(amount: bigint, feeCentiBps: bigint): bigint; // ceiling
```

- `CHAINS` is declared `as const satisfies readonly CctpChain[]`, so `ChainId` is a
  literal union.
- The Iris client takes an optional `fetch` and a shared rate limiter. `reattest`
  sends `POST`.

### `@usewhisk/core`

```ts
export interface RoutePlan {
  source: CctpChain;
  destination: CctpChain;
  network: Network;
  speed: "fast" | "standard";
  mint: { kind: "forwarder" } | { kind: "adapter"; ecosystem: Ecosystem };
  requiredAdapters: readonly Ecosystem[];
  etaSeconds: { min: number; max: number };
}

export function planRoute(input: {
  source: ChainId;
  destination: ChainId;
  connected: readonly Ecosystem[];
  useForwarder: boolean;
}): RoutePlan; // throws NetworkMismatchError | RouteUnavailableError

export interface Quote {
  id: string;
  plan: RoutePlan;
  amountIn: bigint;
  burnFee: bigint;
  forwarderFee: bigint;
  maxFee: bigint;
  amountOut: bigint;
  expiresAt: number;
}

export interface Whisk {
  quote(input: QuoteInput): Promise<Quote>;
  send(input: { quote: Quote; recipient: string }): Promise<SendResult>;
  // send throws QuoteExpiredError, or QuoteChangedError carrying the fresh quote
  resume(record: InflightRecord): Promise<SendResult>;
  inflight(): Promise<readonly InflightRecord[]>;
}

export interface InflightRecord {
  id: string;
  plan: Pick<RoutePlan, "network" | "speed" | "mint"> & {
    source: ChainId;
    destination: ChainId;
  };
  amountIn: string; // bigint serialised as a decimal string
  maxFee: string;
  recipient: string;
  step: "signing" | "burned" | "attested" | "minted" | "failed";
  sourceTxHash?: string;
  nonce?: string;
  updatedAt: number;
}

export interface InflightStore {
  put(r: InflightRecord): Promise<void>;
  list(): Promise<readonly InflightRecord[]>;
  remove(id: string): Promise<void>;
}
```

- `createWhisk` takes an `inflightStore`. The default is in-memory in core, and react
  provides a `localStorage` store.
- `createWhisk` takes an optional `fetch`.
- `config.mode` is removed.
- Errors carry a stable `code`, for example `network_mismatch`, `route_unavailable`,
  `quote_expired`, `quote_changed`, `iris_rate_limited` and `invalid_recipient`.

### `@usewhisk/react`

- `WhiskProvider` takes a `theme` prop: `"light" | "dark" | "auto"` plus token
  overrides.
- It renders a `[data-whisk]` portal container and passes it to every Radix `Portal`
  through context.
- `WhiskSend` shows a "Resume" list from `engine.inflight()`, and a re-confirm view on
  `QuoteChangedError`.

## State changes

1. **In-flight records:**
   - written with `step: "signing"` before the burn is submitted;
   - updated to `burned` with the tx hash, then `attested` with the nonce, then
     `minted`;
   - removed once a receipt is shown and the payer dismisses it.
   - The react store keys are `whisk:inflight:<id>`.
2. **Quotes are immutable.** A refreshed quote is a new object with a new `id`.
3. **Iris limiter state:** one shared token bucket per process, set to 30 requests
   per second. A 429 sets a 5-minute blocked-until timestamp that every caller sees.

## Test strategy

The harness is built first. Every later step starts with a red test on it.

- **Harness** (`packages/core/test/harness/`):
  - an in-memory fake chain per ecosystem that records approve, burn and mint calls and
    keeps balances in bigint;
  - a fake Iris served through the injected `fetch`, scriptable for pending, complete,
    expired and 429 responses;
  - a fake `InflightStore`.
  - No `vi.mock("@usewhisk/cctp")` in engine tests.
- **Red tests**, one per defect, each named after its issue:

  | Issue | Failing test |
  |---|---|
  | #62 | A Base mainnet to Arc mainnet send with `mode: "testnet"` in the old config hits the sandbox Iris host. After the fix the `mode` option no longer exists, and the network is mainnet |
  | #63 | Solana to EVM with `useForwarder: false` and no EVM adapter records a burn. After the fix, `planRoute` throws and the fake Solana chain records zero burns |
  | #64 | `chainByDomain(27, "testnet")` and `(25, "testnet")` throw |
  | #65 | The resolver rejects a valid Stellar G strkey and a short Starknet felt |
  | #66 | `reattest` sends GET |
  | #67 | `computeBurnFee(999_999n, 130n)` returns `129n` instead of `130n` |
  | #69 | A rendered `ChainPicker` opens outside `[data-whisk]` |
  | #71 | A same-chain `Arc_Testnet` send throws `UnknownChainError` |
  | #86 | Closing the engine after `burned` leaves nothing in the store |
  | #87 | `send(quote)` burns with a `maxFee` different from `quote.maxFee` |
  | #88 | `parseFeeBps(1.1)` scales through a float. A lint test rejects `parseFloat` in a money path |
  | #89 | A rejected `send` in `WhiskSend` produces an unhandled rejection and no error text |

- **Wiring suite (#90):**
  - all 12 executors through `createWhisk().send`;
  - each asserts the burn arguments: domain, `mintRecipient`, `destinationCaller`,
    `maxFee` and hookData;
  - each has a "pre-mint check fails, zero burns" case;
  - the Stellar forwarder rule gets its own assertion.
- **React tests:** Testing Library with jsdom. A test fails on any unhandled rejection
  (a `process.on("unhandledRejection")` guard in the setup file).
- **Scripts, outside `quality`:**
  - `scripts/check-registry.ts` (#93) reads `localDomain()` from every EVM
    MessageTransmitterV2.
  - `pnpm test:testnet` runs the six-pair testnet matrix (ADR Decision 10.4). Both run
    nightly, with funded keys held in Actions secrets.

## Mockups / flows

```
Resume                                   Fee changed
+-----------------------------------+    +-----------------------------------+
| 1 transfer in progress            |    | Fees went up since your quote     |
| 25.00 USDC  Base -> Arc           |    | Network fee  0.0130 -> 0.0190 USDC|
| attesting...         [ Resume ]   |    | You receive  24.9870 -> 24.9810   |
| receipt: usewhisk.xyz/r/...       |    | [ Cancel ]        [ Confirm new ] |
+-----------------------------------+    +-----------------------------------+
```

Route refused before signing:

```
| Solana -> Base needs a Base wallet to finish the transfer. |
| [ Connect a Base wallet ]   or   turn on Circle forwarding |
```

## Steps

Each step is one PR into `feat/v1-cctp-rebuild`, with red commits before green, and
`./scripts/preflight.sh` passing in full.

1. **Rebase and trim.** Rebase #57 onto `main`. Remove `apps/console`,
   `react/src/cloud` and the protocol-fee display. Repoint `build:apps` and the
   examples. Verify: preflight passes; the playground runs.
2. **Test harness.** Fake chains, fake Iris over `fetch`, fake store, and the
   `fetch` injection in cctp and core. Verify: the existing tests pass on the harness,
   with no module mocks of cctp left in the engine tests.
3. **One registry (#70, #64, #72, #93).**
   - Rename cctp chain ids to the App Kit strings.
   - Add every launch-set chain on both networks, with addresses copied from Circle's
     and Arc's published tables, and capability flags.
   - Derive `Chain` in core. Delete `core/src/chains/registry.ts`, `DOMAIN_MAP` and
     both `lookupCctpChain` copies.
   - Add `scripts/check-registry.ts`.
   - Verify: the #64 red test is green, and the registry check passes against public
     RPCs.
4. **Exact money maths (#67, #88).** `parseFeeBps`, ceiling `computeBurnFee`, bigint
   forwarder fee, bigint display formatting, and the lint rule. Verify: the red tests
   are green, and no `parseFloat`, `Number(` or `toFixed(` remains in a money path.
5. **Network from source and route planning (#62, #63, #91).** Remove `mode`. Add
   `planRoute`, `NetworkMismatchError`, `RouteUnavailableError`, Standard-only
   sources with ETAs, and the Solana to EVM adapter mint. Verify: the red tests are
   green; a Polygon Amoy source plans as Standard.
6. **Bound quotes and fees (#87),** per
   [ADR-2026-10-18-bound-quotes-and-fees](../adr/ADR-2026-10-18-bound-quotes-and-fees.md).
   - **6a:** quote ids, expiry, `QuoteExpiredError` and `QuoteChangedError`, the 10%
     Fast buffer, the forwarding fee level, and `getMinFeeAmount` behind
     `standardFeeSwitch`. Verify: the red test is green, and a fee rise surfaces the
     re-confirm path.
   - **6b:** Circle's signed quotes and `depositForBurnWithFees` on `upfrontFeeSource`
     chains, plus the Fast allowance check. Verify: a testnet transfer from Base
     Sepolia and from Arc Testnet settles with the exact amount.
7. **Recovery (#86, #66).** `InflightStore`, persist before the burn, `resume`,
   `inflight()`, POST re-attest, the Iris rate limiter with 429 backoff. Verify: the
   red tests are green; a harness run killed after `burned` resumes to `minted`.
8. **Arc rules (#71).**
   - viem peer dependency `>=2.49.3 <3`, using viem's `arc` chains.
   - Arc native currency `USDC` at 18 decimals, and the 6-decimal ERC-20 view.
   - The gas floor clamp, "max" gas headroom, `-32014` retry, and log paging.
   - Arc first in the examples.
   Verify: the red test is green, and a harness Arc send sets `maxFeePerGas` of at least
   20 Gwei.
9. **Widget (#65, #69, #73, #89).** The portal container, the `light` / `dark` /
   `auto` presets, typed error rendering in every handler, the multi-ecosystem
   resolver, the Resume list and re-confirm views. Verify: the red tests are green, and
   the playground checks from ADR Verification are done by hand.
10. **Wiring suite (#90).** The remaining executor coverage, plus the testnet matrix
    script and its nightly workflow. Verify: all 12 executors are covered, and one
    manual matrix run passes on testnet.
11. **Directive 6 sweep (#92).** Every comment in `packages/*/src` and `examples/*`.
    Verify: there are zero em-dashes and zero banners in the diff, and the maintainer
    spot-checks the comments.
12. **Release (#74).**
    - Changesets for cctp `0.1.0`, and core and react `0.2.0`.
    - The migration page content, handed to `usewhisk/docs`.
    - A release workflow with npm provenance.
    - The maintainer runs two 1 USDC mainnet transfers, then #57 merges and the
      packages publish.
