/**
 * Generate a fresh Solana Devnet keypair for the live sweep.
 *
 * Prints the public key + base58-encoded secret key. Save the secret
 * to a password manager and pass it as `WHISK_SOLANA_PK` when running
 * `test:live`. Never commit, never check into the repo.
 *
 * Fund with:
 *   - SOL    https://faucet.solana.com  (paste the pubkey)
 *   - USDC   https://faucet.circle.com  (select Solana Devnet)
 */
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const kp = Keypair.generate();
const secretBase58 = bs58.encode(kp.secretKey);

console.log("\n── Solana Devnet keypair ──");
console.log(`Public key:        ${kp.publicKey.toBase58()}`);
console.log(`Secret (base58):   ${secretBase58}`);
console.log("\nNext steps:");
console.log(`  1. Save the secret somewhere safe — never commit.`);
console.log(
  `  2. Drip SOL at https://faucet.solana.com (use the public key above)`,
);
console.log(
  `  3. Drip Devnet USDC at https://faucet.circle.com (select Solana Devnet)`,
);
console.log(`  4. Run the live sweep:`);
console.log(`     WHISK_SOLANA_PK="${secretBase58}" \\`);
console.log(`     WHISK_HELIUS_KEY="..." \\`);
console.log(`     pnpm --filter @usewhisk/core test:live\n`);
