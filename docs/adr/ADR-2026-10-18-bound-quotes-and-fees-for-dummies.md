# ADR for Dummies: Bound quotes and fees

- **Status:** Proposed, awaiting maintainer approval
- **Date:** 2026-10-18

## The Idea

The price a payer sees is the price they sign. Today Whisk shows one fee and then works
it out again at the last moment, so the two can differ. After this change, the shown fee
is locked in for a minute. If the real fee rises above it, the payer is asked again.

On 18 blockchains where Circle offers it, Whisk will also pay Circle's fee separately.
The recipient then gets exactly the amount sent, not the amount minus a fee.

## What the Person Sees

1. The payer enters an amount, picks the blockchains and a recipient, and sees the
   fees.
2. They press send within a minute. If they wait longer, the form fetches fresh fees
   on its own.
3. If fees went up past what they were shown, they see "Fees went up since your
   quote", with the old and new numbers, and choose to confirm or cancel. Nothing is
   signed until they choose.
4. When sending from Base, Arbitrum, Ethereum, Arc, Avalanche, Polygon and twelve
   other chains, the recipient gets exactly the amount. The fee shows as its own line,
   and the payer pays at most that.
5. From the other chains (Solana, Stellar, Starknet and a few EVM chains), the fee
   still comes out of the transfer. The form shows the minimum the recipient will get,
   and they may get slightly more.

## Important Limitation

- Circle's separately paid fee is not refunded, even if the transfer ends up cheaper
  to deliver.
- On chains without that option, Whisk adds a small safety margin to the fee limit.
  Circle only takes what it really charges. In the default setup, where the payer
  covers the fees, anything Circle does not take goes to the recipient, not back to
  the payer.
- Circle's paid delivery service has three price levels. Whisk picks the higher one,
  which is safer, except for transfers into Ethereum. There the higher level costs
  about 30 cents more, so Whisk picks the middle one. A developer can change this.

## What Changes

- Every quote has an id and an expiry, and sending uses that exact quote.
- A new "fees went up" screen asks the payer to re-confirm.
- On 18 chains, the recipient gets the exact amount sent.
- Transfers that should be fast stay fast. A fee that is a little short no longer
  quietly turns an 8-second transfer into a 15-minute one.
- The work ships as two pull requests: locked quotes first, then the exact-amount
  option. The second waits for a live testnet transfer.

## What Does Not Change

- No API key, account or server is needed. Circle's quote service is open.
- Whisk still takes no fee of its own.
- Solana, Stellar and Starknet transfers work the same way they do today, apart from
  the locked quote.
- Recovery, receipts and the widget's look are separate steps.
