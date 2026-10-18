/**
 * Issue a refund from a viem-backed merchant wallet.
 *
 * The original tx hash, payer address, and refund amount come from your
 * order book in production. This demo accepts them via env vars so you
 * can run it against a real test transfer.
 *
 * Usage:
 *   PRIVATE_KEY=0x... \
 *   ORIGINAL_TX=0x... PAYER_ADDRESS=0x... AMOUNT=10.00 \
 *   REASON=customer_request pnpm refund
 */
import { createWhisk } from "@usewhisk/core";
import type { Hex } from "viem";
import { createEvmAdapter } from "./adapter.js";
import { env } from "./env.js";

const PRIVATE_KEY = (env.privateKey ?? env.required("PRIVATE_KEY")) as Hex;
const originalTxHash = env.required("ORIGINAL_TX");
const payerAddress = env.required("PAYER_ADDRESS");
const amount = env.required("AMOUNT");
const reason = process.env.REASON ?? "customer_request";

// The merchant received the original payment on Ethereum Sepolia,
// refunding the buyer back to Base Sepolia.
const ORIGINAL_DESTINATION = "Ethereum_Sepolia";
const REFUND_DESTINATION = "Base_Sepolia";

async function main() {
  const merchantAdapter = createEvmAdapter({
    chain: ORIGINAL_DESTINATION,
    privateKey: PRIVATE_KEY,
  });

  const engine = createWhisk({
    chains: [ORIGINAL_DESTINATION, REFUND_DESTINATION],
    mode: "testnet",
  });

  console.log(
    `Refunding ${amount} USDC to ${payerAddress} on ${REFUND_DESTINATION}…`,
  );

  const result = await engine.refund(
    {
      originalTxHash,
      originalDestinationChain: ORIGINAL_DESTINATION,
      refundDestinationChain: REFUND_DESTINATION,
      originalSenderAddress: payerAddress,
      amount,
      reason,
      merchantAdapter,
    },
    {
      onStep: (step) => {
        console.log(`  [${step.state.toUpperCase()}] ${step.name}`);
      },
    },
  );

  if (result.kind === "success") {
    console.log(
      `\nRefund settled. Final tx: ${result.finalTxHash ?? "(forwarded)"}`,
    );
    console.log("\nRefund correlation metadata:");
    console.log(JSON.stringify(result.metadata, null, 2));
  } else {
    console.error(`\nRefund failed: ${result.error.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
