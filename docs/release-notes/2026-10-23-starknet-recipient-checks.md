---
date: 2026-10-23
feature: Starknet recipients are checked before a quote
scope: fix
scenario-impact: none
---

# Starknet recipients are checked before a quote

A Starknet recipient was only checked for being a felt, `0x` and 1 to 64 hex digits.
A payer bridging into Starknet who pasted their Ethereum address got a quote, signed,
and the USDC was minted to a Starknet address that nobody holds a key for.

A quote into Starknet, for a bridge or a same-chain send, now checks the recipient in
two steps:

- **Shape:** an address that fits in 20 bytes is refused with `InvalidAddressError`
  and the message "looks like an Ethereum address". Starknet account addresses are
  hashes, so a real one that small is vanishingly unlikely. Addresses at or past
  `2**251 - 256`, outside Starknet's address range, are refused too.
- **On chain:** the engine reads `starknet_getClassHashAt` for the address, over the
  configured `rpcUrls` for the destination and then the chain's defaults. With no
  contract there, the quote fails with `RouteUnavailableError`, reason
  `recipient_not_deployed`. An RPC failure fails the quote; it is never read as
  either answer.

An account that has not been deployed yet is real: USDC sent to it is held at the
address, and its owner can spend it once their wallet deploys the account, which it
does with its first transaction. So the payer can
confirm, and the quote passes `allowUndeployedRecipient: true`. `<WhiskSend>` shows a
warning with an "It's my wallet, continue" button for this. The connected Starknet
wallet's own address skips the check, since that wallet controls it.

`engine.maxSendable` and the re-quote `send` makes when fees rise skip the recipient
checks. Max only works out fees, and the widget stands the payer's own address in for
the recipient before one is entered, which the checks refused for a bridge into
Solana and now would for Starknet. A re-quote is for a recipient the payer already
confirmed.

Fixed in `@usewhisk/cctp` 0.1.x and `@usewhisk/core` and `@usewhisk/react` 0.2.x.
Closes #162.
