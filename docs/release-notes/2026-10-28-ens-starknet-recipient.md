---
date: 2026-10-28
feature: ENS names never resolve to a Starknet recipient
scope: fix
scenario-impact: none
---

# ENS names never resolve to a Starknet recipient

`createEnsResolver` (and the default resolver that includes it) returned a name's
Ethereum address for a Starknet destination. ENSIP-11 has no coin type Whisk maps for
Starknet, so the lookup ran without one and viem fell back to the Ethereum record.

In 0.2.x a 40-hex Ethereum address passed the Starknet address check, so USDC could
be minted to a Starknet address nobody controls. Since 0.3.0 the quote refuses
Ethereum-shaped Starknet recipients before the burn, so the payer saw "looks like an
Ethereum address" for a name they never typed as one.

The resolver now returns `null` for any destination without an ENS coin type (Starknet
and Stellar) without looking the name up, and the recipient field asks for a native
address instead. EVM and Solana lookups are unchanged.
