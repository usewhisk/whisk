# node-headless

Six small Node scripts that drive `@usewhisk/core` from a server.
No React, no UI, no browser dependencies. Demonstrates the canonical
back-office shapes: scheduled payouts, refunds, settlement status
polling, and signed webhooks.

Every script is under 100 lines. Read them top to bottom.

## Setup

```bash
pnpm install
```

Each script reads its own env vars — see the comment at the top of
each file. Common ones:

| Script              | Env vars required                                                  |
| ------------------- | ------------------------------------------------------------------ |
| `send.ts`           | `PRIVATE_KEY`, `SENDER_ADDRESS`, `TO`, `AMOUNT` (default `"1.00"`) |
| `payroll.ts`        | `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `MERCHANT_ADDRESS`       |
| `refund.ts`         | All of `payroll.ts` plus `ORIGINAL_TX`, `PAYER_ADDRESS`, `AMOUNT`, `REASON` |
| `receipt.ts`        | `SOURCE_CHAIN`, `DEST_CHAIN`, `TX`                                 |
| `webhook-server.ts` | `WHISK_WEBHOOK_SECRET`, `PORT` (default `4747`)                    |
| `webhook-send.ts`   | `WHISK_WEBHOOK_SECRET`, `WHISK_WEBHOOK_ENDPOINT`                   |

## Run

```bash
pnpm --filter @usewhisk/example-node-headless send
pnpm --filter @usewhisk/example-node-headless payroll
pnpm --filter @usewhisk/example-node-headless refund
pnpm --filter @usewhisk/example-node-headless receipt
pnpm --filter @usewhisk/example-node-headless webhook-server
pnpm --filter @usewhisk/example-node-headless webhook-send
```

## What each script demonstrates

- **`send.ts`** — Build a viem adapter from a private key, quote a
  CCTP bridge, send. The simplest possible engine path.
- **`payroll.ts`** — Same engine, swapped adapter: Circle DCW
  instead of a private key. Loops over a hardcoded payee list.
  Drop in your DB and this becomes a real payroll runner.
- **`refund.ts`** — `engine.refund` with a DCW adapter. Logs the
  refund-correlation metadata (`__refundOfTxHash`, `__refundReason`)
  that travels with the transfer.
- **`receipt.ts`** — `pollAttestation` + `deriveReceiptView`. Same
  primitives `<WhiskReceipt>` uses internally. Watch a bridge
  settle from a worker process.
- **`webhook-server.ts`** — Minimal `node:http` server that uses
  `verifyWebhook` to authenticate incoming notifications.
- **`webhook-send.ts`** — Sign and POST a payload to that server.
  End-to-end HMAC round-trip locally.

## Production shape

A real fulfilment service combines these. The pattern from
[the checkout flow doc](https://docs.whisk.dev/docs/flows/checkout):

1. Web frontend → backend creates order with a nonce.
2. Customer pays through the Whisk widget, frontend pings backend.
3. Backend verifies on-chain (separate from Whisk — viem getTransactionReceipt).
4. Backend uses `engine.refund` if needed, signs webhook fan-out
   via `signWebhook` to your accounting / email / CRM services.

The scripts here are the building blocks for that backend.
