---
date: 2026-10-17
feature: Whisk v1, rebuilt on direct CCTP V2
scope: feat
scenario-impact: needs_automation
---

# Whisk v1 on direct CCTP V2

Whisk moves USDC by calling Circle's CCTP V2 contracts directly, through the new
`@usewhisk/cctp` package, instead of going through App Kit. Payers can send from and
to Stellar and Starknet as well as EVM chains and Solana. The widget gains receipts,
refunds, webhooks and theming, and new headless examples show the engine without the
widget.

Removed: App Kit, the swap tab and user-controlled wallets.

Technical shape, per
[ADR-2026-10-16-phase-1-foundation](../adr/ADR-2026-10-16-phase-1-foundation.md):

- Layering is `cctp`, then `core`, then `react`, then the examples.
- The packages need no app ID. `appId` and `cloudBaseUrl` are gone from
  `createWhiskConfig`, along with `useWhiskCloud` and the Whisk protocol-fee row in
  `WhiskSend`. A handshake that verifies its token returns in Phase 2.
- The hosted console is not part of this repo. It moves to `usewhisk/platform`.
- `.gitleaks.toml` allows the public Stellar contract and issuer addresses and the
  fixture webhook secrets in tests, which gitleaks reads as generic API keys.

This note is updated as each Phase 1 step lands on the branch. The testnet matrix
from Step 10 is the automation this release still needs.
