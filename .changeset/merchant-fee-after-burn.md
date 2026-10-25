---
"@usewhisk/core": minor
"@usewhisk/react": minor
---

Never take the merchant fee before the transfer. A `feePolicy` fee was sent ahead of
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
