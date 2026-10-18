/**
 * Sign and POST a webhook payload to the local server in webhook-server.ts
 * (or any HTTPS endpoint).
 *
 * Usage:
 *   WHISK_WEBHOOK_SECRET=secret-1 \
 *   WHISK_WEBHOOK_ENDPOINT=http://localhost:4747/webhook \
 *   pnpm webhook-send
 */
import { signWebhook } from "@usewhisk/core";
import { env } from "./env.js";

const secret = env.webhookSecret ?? env.required("WHISK_WEBHOOK_SECRET");
const endpoint = env.webhookEndpoint ?? env.required("WHISK_WEBHOOK_ENDPOINT");

async function main() {
  const payload = {
    type: "order.paid",
    orderId: `ord_${Date.now()}`,
    amount: "12.00",
    txHash: "0x" + "0".repeat(64),
  };

  const { body, headers } = await signWebhook(payload, secret);

  console.log(`POST ${endpoint}`);
  console.log(`  body: ${body}`);
  console.log(`  x-whisk-signature: ${headers["x-whisk-signature"]}`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body,
  });

  console.log(`\nResponse ${response.status}:`);
  console.log(await response.text());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
