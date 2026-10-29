---
date: 2026-10-29
feature: "@usewhisk/cctp drops @solana/spl-token"
scope: fix
scenario-impact: none
---

# @usewhisk/cctp drops @solana/spl-token

`@usewhisk/cctp` imported one thing from `@solana/spl-token`: `TOKEN_PROGRAM_ID`, the
fixed address of the SPL Token program that owns Solana USDC. The dependency also
brought `@solana/buffer-layout-utils` and `bigint-buffer`, whose native
`toBigIntLE()` has a high-severity advisory (CVE-2025-3194, GHSA-3gc7-fjrx-p6mg)
and no fixed release.

The program ID is now a constant in `packages/cctp/src/solana/programs.ts`, and the
dependency is gone, so anything that installs `@usewhisk/cctp` alone (Whisk Cloud
reads its chain registry) no longer gets `bigint-buffer`. A test pins the address and
fails if the dependency comes back.

`@usewhisk/core` still depends on `@solana/spl-token` to build Solana transfer
instructions, so `audit-exceptions.json` keeps its `bigint-buffer` entry. The burn and
mint instructions are unchanged: they pass the same program ID as before.
