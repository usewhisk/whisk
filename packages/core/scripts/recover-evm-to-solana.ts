/**
 * One-off recovery: complete an EVM → Solana bridge whose burn already
 * landed on chain but whose attestation arrived after the live runner's
 * polling window.
 *
 * Reads the burn TX hash from CLI, fetches the message + attestation
 * from Iris, builds the Solana `receive_message` instruction via the
 * engine's own helpers, and submits via the live Solana node adapter.
 *
 * Usage:
 *   WHISK_SOLANA_PK=... WHISK_HELIUS_KEY=... \
 *   pnpm exec tsx scripts/recover-evm-to-solana.ts <burnTxHash>
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type AccountMeta,
  type Commitment,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";
import {
  BaseSepolia,
  buildSolanaReceiveIntent,
  deriveTokenMessenger,
  pollMessages,
  parseTokenMessengerFeeRecipient,
  SolanaDevnet,
  toBytes32,
} from "@usewhisk/cctp";

const burnHash = process.argv[2];
if (!burnHash) {
  console.error("usage: recover-evm-to-solana.ts <0xBurnTxHash>");
  process.exit(1);
}

const SOLANA_PK_RAW = process.env["WHISK_SOLANA_PK"];
const HELIUS_KEY = process.env["WHISK_HELIUS_KEY"];
if (!SOLANA_PK_RAW || !HELIUS_KEY) {
  console.error("WHISK_SOLANA_PK and WHISK_HELIUS_KEY are required");
  process.exit(1);
}

const keypair = Keypair.fromSecretKey(bs58.decode(SOLANA_PK_RAW));
const connection = new Connection(
  `https://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
  "confirmed",
);

console.log(`Solana signer: ${keypair.publicKey.toBase58()}`);
console.log(`Burn hash:     ${burnHash}\n`);

async function main() {
  // 1. Fetch the attestation from Iris.
  console.log("Fetching attestation from Iris...");
  const message = await pollMessages(
    { sourceDomain: BaseSepolia.cctpDomain, transactionHash: burnHash },
    { network: "testnet", intervalMs: 2000, timeoutMs: 10_000 },
  );
  if (!message) {
    console.error("FAIL: no message in Iris for that burn hash.");
    process.exit(1);
  }
  if (message.status !== "complete") {
    console.error(`FAIL: status=${message.status}; expected complete.`);
    process.exit(1);
  }
  console.log(`  status=${message.status}`);
  console.log(`  message.length=${(message.message.length - 2) / 2} bytes`);
  console.log(
    `  attestation.length=${(message.attestation.length - 2) / 2} bytes\n`,
  );

  // 2. Discover the on-chain fee_recipient on the destination TMM.
  const tmmProgram = new PublicKey(SolanaDevnet.tokenMessengerMinter);
  const tokenMessengerPda = deriveTokenMessenger(tmmProgram);
  console.log(`Reading TokenMessenger PDA: ${tokenMessengerPda.toBase58()}`);
  const info = await connection.getAccountInfo(tokenMessengerPda, "confirmed");
  if (!info) {
    console.error("FAIL: TokenMessenger PDA not found on chain.");
    process.exit(1);
  }
  const feeRecipient = parseTokenMessengerFeeRecipient(
    new Uint8Array(info.data),
  );
  console.log(`  fee_recipient: ${feeRecipient.toBase58()}\n`);

  // 3. Derive USDC ATAs.
  const usdcMint = new PublicKey(SolanaDevnet.usdc);
  const recipientAta = getAssociatedTokenAddressSync(
    usdcMint,
    keypair.publicKey,
  );
  const feeRecipientAta = getAssociatedTokenAddressSync(usdcMint, feeRecipient);
  console.log(`  recipient USDC ATA:    ${recipientAta.toBase58()}`);
  console.log(`  fee-recipient USDC ATA: ${feeRecipientAta.toBase58()}\n`);

  // 4. Encode source-token bytes32 (Base Sepolia USDC).
  const sourceTokenHex = toBytes32(BaseSepolia.usdc).slice(2);
  const sourceTokenBytes32 = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    sourceTokenBytes32[i] = parseInt(
      sourceTokenHex.slice(i * 2, i * 2 + 2),
      16,
    );
  }

  // 5. Hex → bytes for message and attestation.
  const messageBytes = hexToBytes(message.message);
  const attestationBytes = hexToBytes(message.attestation);

  // 6. Build receive intent.
  const intent = buildSolanaReceiveIntent({
    destination: SolanaDevnet,
    message: messageBytes,
    attestation: attestationBytes,
    sourceDomain: BaseSepolia.cctpDomain,
    sourceTokenBytes32,
    feeRecipientUsdcAta: feeRecipientAta,
    recipientUsdcAta: recipientAta,
    payer: keypair.publicKey,
  });

  // 7. Verify the recipient ATA already exists — if not, we'd need to
  // create it in a separate tx because receive_message is already at the
  // legacy tx size cap (1232B) with no headroom for the ATA-create.
  const ataInfo = await connection.getAccountInfo(recipientAta, "confirmed");
  if (!ataInfo) {
    console.error(
      "FAIL: recipient USDC ATA doesn't exist. Create it via a separate transferChecked tx first.",
    );
    process.exit(1);
  }
  console.log(`  recipient ATA exists (data=${ataInfo.data.length}B)\n`);

  // 8. Submit.
  const tx = new Transaction();
  tx.add(
    new TransactionInstruction({
      programId: new PublicKey(intent.instruction.programId),
      keys: intent.instruction.keys.map((k) => ({
        pubkey: new PublicKey(k.pubkey),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: Buffer.from(intent.instruction.data),
    }),
  );
  tx.feePayer = keypair.publicKey;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.sign(keypair);

  console.log("Submitting receive_message...");
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed" as Commitment,
  });
  console.log(`  signature: ${sig}`);

  console.log("Confirming...");
  const result = await connection.confirmTransaction(sig, "confirmed");
  if (result.value.err) {
    console.error(`FAIL: tx reverted: ${JSON.stringify(result.value.err)}`);
    process.exit(1);
  }
  console.log(`OK   confirmed at slot=${result.context.slot}`);
  console.log(`     https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

function hexToBytes(hex: string): Uint8Array {
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

main().catch((err) => {
  console.error("\nFATAL", err);
  process.exit(1);
});
