---
"@usewhisk/cctp": patch
---

`@usewhisk/cctp` no longer depends on `@solana/spl-token`. It used it for one constant, the SPL Token program ID, and the package pulled in `bigint-buffer`, which carries a high-severity advisory (CVE-2025-3194) with no fixed release. Installs of `@usewhisk/cctp` alone no longer include it. `@usewhisk/core` still uses `@solana/spl-token` to build Solana transfers.
