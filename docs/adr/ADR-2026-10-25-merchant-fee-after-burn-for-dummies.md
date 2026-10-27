# ADR for Dummies: Merchant fee after the burn

- **Status:** Accepted (2026-10-25)
- **Date:** 2026-10-25

## The Idea

Today a payer pays the merchant's fee first and the transfer second. If the transfer
then fails or the payer cancels it, the fee is gone. From now on the fee is only
taken together with the transfer, or after it.

## What the Person Sees

1. The payer presses Send.
2. **Newer wallets** (smart accounts, wallets that can bundle calls) show one prompt
   covering the transfer and the fee. Either everything goes through or nothing does.
3. **Other wallets** first ask for the transfer as usual. Once it has gone through,
   they ask for the fee.
4. If the payer cancels the fee prompt, the transfer still finishes, because the money
   has already left. The receipt says the fee was not paid.

## Important Limitation

On older wallets a payer can cancel the fee prompt and keep the transfer. The merchant
and Whisk then miss that fee. Whisk reports it on the result, so a merchant can hold
the order. Closing that gap fully needs an on-chain contract, which is later work.

## What Changes

- A cancelled or failed transfer never costs the payer the fee.
- Newer wallets get one prompt instead of three or four.
- Every result says whether the fee was paid.
- The widget shows "fee not paid" when that happens.

## What Does Not Change

- The fee amount and the 90/10 split between merchant and Whisk.
- Transfers with no fee policy behave exactly as before.
- Solana, Stellar and Starknet payments, which do not charge the fee today.

## Decision Needed

Should a merchant be able to refuse payers whose wallet cannot bundle, rather than
risk a skipped fee? The proposal leaves this out for now.
