---
"@usewhisk/core": patch
"@usewhisk/react": patch
---

Bridges into Stellar and Starknet now check the destination before the burn instead of after it. The destination wallet must be on the right network, and a Stellar recipient that is a classic account must hold an authorized USDC trustline with room for the amount. When a check fails, nothing is signed or sent.

`StellarAdapter` gains an optional `getTrustline(account, asset)`. The adapter from `@usewhisk/react` implements it. A custom Stellar adapter without it can still bridge into contract addresses, but a bridge into a `G` or `M` account is refused before the burn, with a `ConfigError`.
