/**
 * Simplest possible headless bridge.
 *
 * Reads PRIVATE_KEY, builds a viem-backed EvmAdapter, quotes a
 * Base Sepolia → Ethereum Sepolia bridge, signs and submits, prints
 * the result.
 *
 * Usage:
 *   PRIVATE_KEY=0x... TO=0xrecipient pnpm send
 */
import { createWhisk } from "@usewhisk/core";
import type { Hex } from "viem";
import { createEvmAdapter } from "./adapter.js";
import { env } from "./env.js";

const PRIVATE_KEY = (env.privateKey ?? env.required("PRIVATE_KEY")) as Hex;
const TO = env.required("TO");
const AMOUNT = process.env.AMOUNT ?? "1.00";

const engine = createWhisk({
  chains: ["Arc_Testnet", "Base_Sepolia"],
});

const adapter = createEvmAdapter({
  chain: "Arc_Testnet",
  privateKey: PRIVATE_KEY,
});

async function main() {
  console.log(`Resolving ${TO} on Base_Sepolia…`);
  const recipient = await engine.resolve(TO, "Base_Sepolia");

  console.log(`Quoting ${AMOUNT} USDC from Arc_Testnet → Base_Sepolia…`);
  const quote = await engine.quote({
    recipient,
    amount: AMOUNT,
    sourceChain: "Arc_Testnet",
    destinationChain: "Base_Sepolia",
    adapter,
  });
  console.log(`Fees: ${quote.fees.total} ${quote.fees.token}`);

  console.log("Sending…");
  const result = await engine.send(
    {
      adapter,
      quote,
    },
    {
      onStep: (step) => {
        const tag = step.state.toUpperCase();
        const hash = step.txHash ? ` ${step.txHash}` : "";
        console.log(`  [${tag}] ${step.name}${hash}`);
      },
    },
  );

  if (result.kind === "success") {
    console.log(`\nSettled. Final tx: ${result.finalTxHash ?? "(forwarded)"}`);
  } else {
    console.error(`\nFailed: ${result.error.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
