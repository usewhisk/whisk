---
date: 2026-11-27
feature: Docs footer no longer claims App Kit
scope: fix
scenario-impact: none
---

# Docs footer no longer claims App Kit

The docs site's footer, on every page, still said the widget was "Built on Circle
App Kit". It now says it is built directly on Circle's CCTP V2, as the rest of the
site does since the [USDC-only cleanup](2026-11-27-usdc-only-no-swap.md).

The line wrapped in the source, so the guard in `scripts/usdc-only.test.mjs`, which
read one line at a time, missed it. The guard now also matches a phrase split across
two lines.
