---
date: 2026-10-23
feature: Stellar and Starknet destinations are checked before the burn
scope: fix
scenario-impact: none
---

# Stellar and Starknet destinations are checked before the burn

For bridges into Stellar and Starknet, two checks that can stop the mint ran only
after the payer's USDC was burned:

- **The destination wallet's network** was read at the mint step. A Stellar wallet on
  testnet, or a Starknet wallet on Sepolia, with a mainnet destination failed after the
  burn.
- **The Stellar recipient's USDC trustline** was never read. `mint_and_forward` pays the
  recipient through the USDC contract, which fails for a classic account without an
  authorized trustline.

The funds were recoverable through `resume` once the cause was fixed, but AGENTS.md
requires every check that can stop the mint to pass before the burn. Solana
destinations already worked this way.

Each of the six executors into Stellar or Starknet now runs these checks before it
asks the source wallet for anything:

- **Network:** the destination wallet must be on the destination chain's network, or the
  send fails with `WrongChainError`.
- **Stellar recipient:** a `G` account, or the base account of an `M` address, must hold
  a USDC trustline that the issuer has authorized and whose limit leaves room for the
  amount. Otherwise the send fails with `RouteUnavailableError`, reason
  `recipient_account_missing`. Contract (`C`) recipients hold USDC in the contract and
  need no trustline.

`StellarAdapter` gains an optional `getTrustline(account, asset)`. `@usewhisk/react`'s
adapter reads the trustline ledger entry directly over Soroban RPC, so an RPC failure is
an error and never looks like a missing trustline. A custom adapter without
`getTrustline` gets a `ConfigError` before the burn when bridging into a classic account.

Fixed in `@usewhisk/core` and `@usewhisk/react` 0.2.x. Closes #164.
