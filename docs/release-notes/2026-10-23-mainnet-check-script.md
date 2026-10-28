---
date: 2026-10-23
feature: Mainnet release check script
scope: chore
scenario-impact: none
---

# Mainnet release check script

`packages/core/scripts/mainnet-check.ts` runs the two mainnet transfers that gate a
release: Base to Arc, then Arc to Base, each to the signer's own address. It ran the
gate for the 0.2 release on 2026-10-22.

- **Before each burn:** it shows the quote (amount paid, minimum received, each fee,
  recipient) and waits for the operator to type `send`.
- **Funds and gas:** it stops before burning when the wallet has no gas, or when the
  amount does not fit after the engine's gas reserve, and it suggests the largest
  amount that does.
- **Recovery:** transfers are kept in `.mainnet-inflight.json` until they mint, so
  `--resume` finishes a burn that never minted. Finished records are dismissed.
- **Key:** `WHISK_LIVE_PK`, read from the environment. `WHISK_RPC_Base` and
  `WHISK_RPC_Arc` override the public RPCs.

Run it from `packages/core`:

```
read -s WHISK_LIVE_PK && export WHISK_LIVE_PK
npx tsx scripts/mainnet-check.ts
```
