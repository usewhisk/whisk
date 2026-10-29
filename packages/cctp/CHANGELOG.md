# @usewhisk/cctp

## 0.1.2

### Patch Changes

- 789904d: `@usewhisk/cctp` no longer depends on `@solana/spl-token`. It used it for one constant, the SPL Token program ID, and the package pulled in `bigint-buffer`, which carries a high-severity advisory (CVE-2025-3194) with no fixed release. Installs of `@usewhisk/cctp` alone no longer include it. `@usewhisk/core` still uses `@solana/spl-token` to build Solana transfers.

## 0.1.1

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

## 0.1.0

### Minor Changes

- 843ca6d: First release. The Circle CCTP V2 protocol layer that `@usewhisk/core` is built on:
  the chain registry for every launch-set chain on mainnet and testnet, burn and mint
  builders for EVM, Solana, Stellar and Starknet, exact fee maths in bigint subunits,
  and an Iris client with rate limiting, POST re-attest and route-sized polling.
