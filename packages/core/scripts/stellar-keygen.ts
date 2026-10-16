/**
 * Generate a fresh Stellar testnet keypair for the live sweep.
 *
 * Prints the public key (G…) + raw seed (S…). Save the seed to your
 * password manager and pass it as `WHISK_STELLAR_SEED` when running
 * `test:live`. Never commit, never check into the repo.
 *
 * Fund with:
 *   - XLM (gas)        https://friendbot.stellar.org?addr=<G…>
 *                       (one-click "Get test network lumens")
 *   - USDC (testnet)   https://faucet.circle.com (select Stellar Testnet)
 *
 * Stellar accounts need an explicit USDC trustline before they can hold
 * USDC. The faucet establishes one automatically. If you fund manually,
 * use Lab (https://lab.stellar.org) → "Add Trustline" with code USDC
 * and the testnet issuer
 * (GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5).
 */
import { Keypair } from "@stellar/stellar-sdk";

const kp = Keypair.random();

console.log("\n── Stellar Testnet keypair ──");
console.log(`Public key (G…): ${kp.publicKey()}`);
console.log(`Secret seed (S…): ${kp.secret()}`);
console.log("\nNext steps:");
console.log(
  `  1. Save the seed somewhere safe — never commit. It IS your full key.`,
);
console.log(
  `  2. Friendbot: https://friendbot.stellar.org?addr=${kp.publicKey()}`,
);
console.log(
  `  3. USDC faucet: https://faucet.circle.com (select Stellar Testnet)`,
);
console.log(`  4. Run the live sweep:`);
console.log(`     WHISK_STELLAR_SEED="${kp.secret()}" \\`);
console.log(`     pnpm --filter @usewhisk/core test:live -- --phase=stellar\n`);
