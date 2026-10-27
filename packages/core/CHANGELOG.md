# @usewhisk/core

## 0.3.0

### Minor Changes

- 8d36f83: Never take the merchant fee before the transfer. A `feePolicy` fee was sent ahead of
  the approve and burn, so a payer who rejected the burn, or whose burn reverted, had
  paid the fee for nothing. On a wallet that supports atomic EIP-5792 batches, the burn
  and the fee now go in one all-or-nothing batch. On any other wallet the fee is a
  separate request once the burn or transfer has landed, and a payer who rejects it
  still gets the transfer.

  `SendSuccess` and `SendFailure` carry `customFee`, `paid` or `unpaid`, whenever a fee
  policy applied, and in-flight records keep it so a resumed transfer reports it
  without asking for it again. `EvmAdapter` gains an optional `supportsAtomicBatch`, and
  `sendCalls` an `atomic` option. `useEvmAdapter` implements both through wagmi's
  `getCapabilities`, `sendCalls` and `waitForCallsStatus`, so `@usewhisk/react` now
  needs `@wagmi/core` 2.17 or later. `<WhiskSend>` says when the fee was not paid.

## 0.2.2

### Patch Changes

- bf91a52: Refuse Starknet recipients that cannot hold the payment. A quote into Starknet now
  rejects an address that fits in 20 bytes, which is almost always an Ethereum address
  pasted by mistake, and an address past the end of Starknet's address range, with
  `InvalidAddressError`. It also reads the address on chain and refuses one with no
  account deployed, with `RouteUnavailableError` reason `recipient_not_deployed`, unless
  the quote passes `allowUndeployedRecipient: true`. The connected Starknet wallet's own
  address is never asked about. `<WhiskSend>` asks the payer to confirm an undeployed
  address before it quotes. `@usewhisk/cctp` adds `getStarknetClassHashAt`.

  `engine.maxSendable` no longer checks the stand-in recipient, so Max works for a bridge
  into Solana or Starknet before a recipient is entered.

- Updated dependencies [bf91a52]
  - @usewhisk/cctp@0.1.1

## 0.2.1

### Patch Changes

- b9013e3: Bridges into Stellar and Starknet now check the destination before the burn instead of after it. The destination wallet must be on the right network, and a Stellar recipient that is a classic account must hold an authorized USDC trustline with room for the amount. When a check fails, nothing is signed or sent.

  `StellarAdapter` gains an optional `getTrustline(account, asset)`. The adapter from `@usewhisk/react` implements it. A custom Stellar adapter without it can still bridge into contract addresses, but a bridge into a `G` or `M` account is refused before the burn, with a `ConfigError`.

## 0.2.0

### Minor Changes

- 843ca6d: Whisk talks to Circle CCTP V2 directly through `@usewhisk/cctp` instead of Circle App
  Kit. This is a breaking release; see `docs/migration/0.1-to-0.2.mdx` for every change
  with before and after code.
  - The `mode` option is gone. The network comes from the source chain, and the widget
    shows only destinations on that network. Chain IDs are unchanged.
  - App Kit, the kit key and the swap surface are removed. Every route moves USDC.
  - Solana, Stellar and Starknet work as sources and destinations, including bridges
    between them.
  - `send` takes the quote the payer confirmed and throws `QuoteExpiredError` or
    `QuoteChangedError` instead of paying a different fee. Fees are exact bigint maths,
    and Circle's signed quote is used on chains that support it.
  - In-flight transfers are saved and resumable after a closed tab (`resume`,
    `resumeFromTx`, `<ResumeList>`, `<WhiskReceipt>`).
  - Routes into Solana check the recipient's USDC account before the burn.
  - `feeBearer` defaults to `"sender"`.
  - The widget has `light`, `dark` and `auto` theme presets, themed dialogs, a balance
    line with Max (holding back Arc gas), and typed errors for every failure.
  - `viem` is a peer dependency of both packages.

### Patch Changes

- Updated dependencies [843ca6d]
  - @usewhisk/cctp@0.1.0

## 0.1.0

### Minor Changes

- 631b659: Fee bearer control and a stale-quote fix.

  **`feeBearer`** — new config option. Default `"receiver"` preserves current behavior (CCTP + Forwarder fees come out of the transfer). Set `feeBearer: "sender"` to size the burn up by the estimated fees so the recipient receives the full amount — useful for checkout, payroll, and invoice flows. Quotes now expose `amountBurned` (the on-chain transfer amount) alongside `amountIn` (sender debit) and `amountOut` (recipient receives). In sender mode the gross-up pads the forwarding portion by a small margin (2%); the forwarder fee is re-priced from destination gas at mint time, so the cushion keeps the recipient at or above the requested amount despite drift, with any unused margin minted to them.

  **Fix** — changing the destination chain after the recipient resolved kept quoting against the original chain. A host-pinned recipient was resolved only once (a one-shot `useRef` latch) and the "Review" gate ignored the chain, so switching destinations reused the stale resolution and bridged to the wrong chain. Auto-resolve is now keyed on recipient + destination, and a resolved recipient whose chain no longer matches the selected destination is re-resolved before quoting.

  **Fix** — host theme overrides were ignored in dark mode. The widget's dark palette lived on `[data-whisk][data-whisk-theme="dark"]` (specificity 0,2,0), which out-specified a host re-theming `--whisk-*` on `[data-whisk]` (0,1,0) — so a dark integration kept the default wine/terracotta colors. The theme discriminators are now wrapped in `:where()`, keeping every theme block at `[data-whisk]` specificity, so host overrides win in light, dark, and system (on the card and in portals).

  **Fix** — wallet errors surfaced the raw viem/App Kit dump (`Request Arguments: …`, `Version: viem@…`). Declining the wallet prompt now reads "You cancelled the transaction in your wallet.", and other errors are trimmed to their human first line (App Kit's "Unknown blockchain error on \<chain\>:" wrapper and the argument dump are stripped). The full provider error is preserved on `cause` for debugging. This cleanup now covers every surface that renders an error — the transfer result screen, the connect modal (EVM and Solana), the manual-mint flow, and the ENS resolver — not just the bridge path. The message cleaner is also exported as `cleanErrorMessage` for custom surfaces.

## 0.0.4

### Patch Changes

- c205454: docs: update docs site URL to usewhisk.xyz in package READMEs

## 0.0.3

### Patch Changes

- 66bde26: Include LICENSE in published tarballs; fix license badge link to resolve on npmjs.com.

## 0.0.2

### Patch Changes

- cb08fa7: Rewrite package comments and READMEs with badges, status, and complete surface coverage
