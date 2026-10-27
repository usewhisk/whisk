---
date: 2026-10-26
feature: Audit exceptions name the package that links the vulnerable version
scope: chore
scenario-impact: none
---

# Audit exceptions name the package that links the vulnerable version

`pnpm audit` prints one dependency path per vulnerable version, and which one it
prints depends on lockfile order. Matching exceptions to that one path made the gate
fail on harmless lockfile regenerations, and could let an uncovered path hide behind
an accepted one at the same version.

- `scripts/audit.mjs` takes each high or critical version from `pnpm audit --json`,
  then asks `pnpm why <package>@<version> -r --json` for every package that links it.
- Each entry in `audit-exceptions.json` names that package as `dependent`, with a
  written reason. Any other dependent, including a Whisk package, fails the gate.
- It also fails on a stale exception, on output it cannot read, and when `pnpm why`
  finds nothing for a version `pnpm audit` reported.
- Two entries are added for `abitype`, which links zod 3.22.4 and 3.25.76 as an
  optional peer and only loads it from its `abitype/zod` entry. The only installed
  package importing that entry is `@coinbase/cdp-sdk`, already accepted.

No published package changes. Decision record:
[ADR-2026-10-26-audit-exceptions-by-dependent](../adr/ADR-2026-10-26-audit-exceptions-by-dependent.md).
