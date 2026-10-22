/**
 * Verifies Whisk webhooks on POST /webhook. PORT defaults to 4747. A failed
 * check returns 401 with the reason.
 *
 * Usage:
 *   WHISK_WEBHOOK_SECRET=secret-1 pnpm webhook-server
 *   # In another terminal:
 *   WHISK_WEBHOOK_SECRET=secret-1 WHISK_WEBHOOK_ENDPOINT=http://localhost:4747/webhook pnpm webhook-send
 */
import http from "node:http";
import { verifyWebhook } from "@usewhisk/core";
import { env } from "./env.js";

const secret = env.webhookSecret ?? env.required("WHISK_WEBHOOK_SECRET");
const port = Number(process.env.PORT ?? 4747);

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/webhook") {
    res.statusCode = 404;
    res.end("not found");
    return;
  }

  // verifyWebhook needs the exact bytes the sender signed, so read the raw
  // body. Parsing and re-serializing JSON would break the signature.
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const rawBody = Buffer.concat(chunks).toString("utf8");

  const result = await verifyWebhook<{ orderId: string; amount: string }>(
    rawBody,
    req.headers as Record<string, string | string[] | undefined>,
    secret,
  );

  if (!result.ok) {
    console.log(`✗ rejected: ${result.reason}`);
    res.statusCode = 401;
    res.end(JSON.stringify({ ok: false, reason: result.reason }));
    return;
  }

  console.log(
    `✓ verified: order ${result.payload.orderId} (${result.payload.amount} USDC)`,
  );
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ ok: true }));
});

server.listen(port, () => {
  console.log(`Webhook server listening on http://localhost:${port}/webhook`);
});
