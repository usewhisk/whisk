---
date: 2026-10-26
feature: Accepted audit findings are scoped to one path each
scope: chore
scenario-impact: none
---

# Accepted audit findings are scoped to one path each

CI's dependency audit failed on every PR, main included, after GHSA-mrhx-c7xc-m3w5
was published: zod before 4.6.6 can exhaust memory validating a large array.

- The docs app drops `fumadocs-docgen`, which it declared but never imported.
- An override keeps zod 4 at 4.6.7 or later, inside zod 4's semver range.
- `pnpm.auditConfig.ignoreGhsas` is gone. It ignored an advisory everywhere and
  forever, and one of its two entries had already stopped matching anything.
- `audit-exceptions.json` accepts a finding by advisory, package, exact version and
  exact dependency path, with a written reason. Three are listed, each with no fixed
  release: zod under WalletConnect's `@reown/appkit-wallet`, zod under Coinbase's
  `@coinbase/cdp-sdk`, and bigint-buffer under `@solana/spl-token`.
- `scripts/audit.mjs` is CI's audit step. It fails on a high or critical finding no
  exception covers, on an exception that no longer matches, and on audit output it
  cannot read. Its tests run with the root `pnpm test`.

No published package changes. Decision record:
[ADR-2026-10-26-scoped-audit-exceptions](../adr/ADR-2026-10-26-scoped-audit-exceptions.md).
