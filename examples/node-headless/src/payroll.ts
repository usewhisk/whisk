/**
 * Pays a list of payees one after another.
 *
 * In production, read payees from your database and record who was paid
 * this cycle. Whisk does not deduplicate payouts, so idempotency is yours.
 *
 * Usage:
 *   PRIVATE_KEY=0x... pnpm payroll
 */
import { createWhisk } from "@usewhisk/core";
import type { Hex } from "viem";
import { createEvmAdapter } from "./adapter.js";
import { env } from "./env.js";

const PRIVATE_KEY = (env.privateKey ?? env.required("PRIVATE_KEY")) as Hex;

// Hardcoded so the script runs without a database.
const payees: Array<{ id: string; address: string; amount: string }> = [
  {
    id: "p-001",
    address: "0x000000000000000000000000000000000000beef",
    amount: "0.10",
  },
  {
    id: "p-002",
    address: "0x000000000000000000000000000000000000cafe",
    amount: "0.20",
  },
];

async function main() {
  const engine = createWhisk({
    chains: ["Arc_Testnet", "Base_Sepolia"],
  });

  // An adapter is bound to one chain. Funding from several chains needs
  // one adapter each.
  const adapter = createEvmAdapter({
    chain: "Arc_Testnet",
    privateKey: PRIVATE_KEY,
  });

  const results: Array<{
    id: string;
    ok: boolean;
    tx?: string;
    error?: string;
  }> = [];

  for (const payee of payees) {
    console.log(`\n→ ${payee.id} (${payee.amount} USDC to ${payee.address})`);
    try {
      const recipient = await engine.resolve(payee.address, "Base_Sepolia");
      const quote = await engine.quote({
        recipient,
        amount: payee.amount,
        sourceChain: "Arc_Testnet",
        destinationChain: "Base_Sepolia",
        adapter,
      });
      const r = await engine.send({
        adapter,
        quote,
        metadata: { payeeId: payee.id },
      });
      if (r.kind === "success") {
        results.push({ id: payee.id, ok: true, tx: r.finalTxHash });
        console.log(`  ✓ paid (tx: ${r.finalTxHash ?? "forwarded"})`);
      } else {
        results.push({ id: payee.id, ok: false, error: r.error.message });
        console.log(`  ✗ failed: ${r.error.message}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id: payee.id, ok: false, error: msg });
      console.log(`  ✗ exception: ${msg}`);
    }
  }

  console.log("\nSummary:");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
