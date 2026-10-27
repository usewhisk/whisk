---
date: 2026-10-25
feature: The merchant fee is never taken before the transfer
scope: fix
scenario-impact: none
---

# The merchant fee is never taken before the transfer

A merchant's `feePolicy` fee was sent ahead of the approve and burn, or ahead of a
same-chain transfer. A payer who then rejected the burn, or whose burn reverted, had
paid the merchant and the Whisk treasury for a transfer that never happened, and
nothing refunded it (#163).

The fee now goes with the transfer or after it, never before. Decision record:
[ADR-2026-10-25-merchant-fee-after-burn](../adr/ADR-2026-10-25-merchant-fee-after-burn.md).

- **Wallets that batch atomically.** When the adapter's new `supportsAtomicBatch` says
  yes for the source chain, the engine sends the approve, the burn and then the fee
  shares in one `sendCalls` with `atomic: true`. The adapter lands all of them or
  none. If the wallet turns the batch down with `atomic_unsupported`, the engine falls
  back to the path below.
- **Every other wallet.** The burn or transfer goes alone, exactly as it does without a
  fee. Once its receipt is a success, the engine asks for each fee share as its own
  request, before the attestation wait. A rejected or reverted fee does not fail the
  transfer.
- **The result says what happened.** `SendSuccess` and `SendFailure` carry
  `customFee` whenever a fee policy applied: `paid` with the fee's transaction hashes,
  or `unpaid` with the wallet's error. `unpaid` with no error means the fee was never
  asked for. When the payer stops after the merchant share, `unpaid` lists the share
  that landed.
- **Resume.** The in-flight record keeps the fee amount and its status. A resumed
  transfer reports it and never asks for the fee again.
- **`useEvmAdapter`.** Reads `getCapabilities` for the chain (`supported` or `ready`
  count as yes; a wallet without EIP-5792 counts as no), sends an atomic batch with
  `forceAtomic`, and waits for it with `waitForCallsStatus`. Calls that carry their
  own gas price, as on Arc, are sent one by one, because a batch cannot carry it.
  `@usewhisk/react` now needs `@wagmi/core` 2.17 or later.
- **`<WhiskSend>`.** The result panel says when the transfer went through but the fee
  was not paid, with the reason.

The trade-off: on a wallet without atomic batches, a payer can reject the fee prompt
and keep the transfer. Merchants who fulfil orders from `onSuccess` should check
`customFee.status`.
