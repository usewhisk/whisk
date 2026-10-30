---
"@usewhisk/cctp": patch
---

`DepositForBurn` and `MessageReceived` in `@usewhisk/cctp/abi` now mark the same fields as indexed as the deployed V2 contracts: `minFinalityThreshold` on `DepositForBurn`, and `nonce` and `finalityThresholdExecuted` (not `sourceDomain`) on `MessageReceived`. Decoding a real log with the old ABIs failed or read the wrong fields. The SDK itself never decodes either event, so payments were not affected.
