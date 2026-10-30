---
date: 2026-10-31
feature: Correct indexed fields in the cctp event ABIs
scope: fix
scenario-impact: none
---

# Correct indexed fields in the cctp event ABIs

`@usewhisk/cctp/abi` exported `DepositForBurn` and `MessageReceived` with the wrong
fields marked as indexed, so decoding a real V2 log failed or read the wrong values.

- `DepositForBurn`: `minFinalityThreshold` is indexed.
- `MessageReceived`: `nonce` and `finalityThresholdExecuted` are indexed;
  `sourceDomain` is not.

A test decodes a real Base Sepolia log of each event, whose values match Circle's Iris
record. The SDK never decodes either event, so no payment path changes. Whisk Cloud's
indexer found the bug while reading the same logs.
