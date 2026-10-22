---
"@usewhisk/core": minor
"@usewhisk/react": minor
---

Whisk talks to Circle CCTP V2 directly through `@usewhisk/cctp` instead of Circle App
Kit. This is a breaking release; see `docs/migration/0.1-to-0.2.mdx` for every change
with before and after code.

- The `mode` option is gone. The network comes from the source chain, and the widget
  shows only destinations on that network. Chain IDs are unchanged.
- App Kit, the kit key and the swap surface are removed. Every route moves USDC.
- Solana, Stellar and Starknet work as sources and destinations, including bridges
  between them.
- `send` takes the quote the payer confirmed and throws `QuoteExpiredError` or
  `QuoteChangedError` instead of paying a different fee. Fees are exact bigint maths,
  and Circle's signed quote is used on chains that support it.
- In-flight transfers are saved and resumable after a closed tab (`resume`,
  `resumeFromTx`, `<ResumeList>`, `<WhiskReceipt>`).
- Routes into Solana check the recipient's USDC account before the burn.
- `feeBearer` defaults to `"sender"`.
- The widget has `light`, `dark` and `auto` theme presets, themed dialogs, a balance
  line with Max (holding back Arc gas), and typed errors for every failure.
- `viem` is a peer dependency of both packages.
