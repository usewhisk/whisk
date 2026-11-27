---
"@usewhisk/core": patch
---

`toWhiskError` no longer gives "No route" text from a swap or routing API its own "No quote available for this pair" message. No CCTP path produces that text; it now gets the generic message, with the original error on `cause`.
