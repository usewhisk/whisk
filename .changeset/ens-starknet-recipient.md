---
"@usewhisk/react": patch
---

ENS names no longer resolve for Starknet or Stellar destinations. The resolver used to hand a Starknet destination the name's Ethereum address, which 0.3.0's quote refuses before the burn and 0.2.x would have accepted.
