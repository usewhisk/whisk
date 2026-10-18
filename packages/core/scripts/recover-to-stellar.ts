/**
 * One-off recovery: complete a bridge whose burn already landed (any
 * source domain) and whose Stellar-destination `mint_and_forward`
 * never fired because the engine's poll window expired before Iris
 * attested.
 *
 * Reads the burn hash + source domain from CLI, fetches the message +
 * attestation from Iris, signs `mint_and_forward(message, attestation)`
 * on the Stellar CctpForwarder using `WHISK_STELLAR_SEED`, and confirms.
 *
 * Usage:
 *   WHISK_STELLAR_SEED=... \
 *   pnpm exec tsx scripts/recover-to-stellar.ts <sourceDomain> <burnHash>
 *
 * Example:
 *   pnpm exec tsx scripts/recover-to-stellar.ts 6 0x522b74e9…b704
 */
import {
  BASE_FEE,
  Keypair,
  Networks,
  TransactionBuilder,
  rpc as sorobanRpc,
} from "@stellar/stellar-sdk";
import {
  buildStellarMintIntent,
  pollMessages,
  StellarTestnet,
} from "@usewhisk/cctp";

const sourceDomain = Number(process.argv[2]);
const burnHash = process.argv[3];
if (!Number.isFinite(sourceDomain) || !burnHash) {
  console.error("usage: recover-to-stellar.ts <sourceDomain> <burnHash>");
  process.exit(1);
}

const SEED = process.env["WHISK_STELLAR_SEED"];
if (!SEED) {
  console.error("WHISK_STELLAR_SEED required");
  process.exit(1);
}

async function main() {
  const kp = Keypair.fromSecret(SEED!);
  const rpcServer = new sorobanRpc.Server(StellarTestnet.defaultRpcUrls[0]!);
  console.log(`Stellar signer:  ${kp.publicKey()}`);
  console.log(`Source domain:   ${sourceDomain}`);
  console.log(`Burn hash:       ${burnHash}\n`);

  console.log("Fetching attestation from Iris...");
  const message = await pollMessages(
    { sourceDomain, transactionHash: burnHash },
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
  console.log(
    `  message=${(message.message.length - 2) / 2}B   attestation=${(message.attestation.length - 2) / 2}B\n`,
  );

  const messageBytes = hexToBytes(message.message);
  const attestationBytes = hexToBytes(message.attestation);

  const intent = buildStellarMintIntent({
    destination: StellarTestnet,
    message: messageBytes,
    attestation: attestationBytes,
  });

  const sourceAccount = await rpcServer.getAccount(kp.publicKey());
  const baseTx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(intent.invocation.operation)
    .setTimeout(180)
    .build();

  console.log("Simulating mint_and_forward...");
  const sim = await rpcServer.simulateTransaction(baseTx);
  if (sorobanRpc.Api.isSimulationError(sim)) {
    console.error(`SIM FAIL: ${sim.error}`);
    process.exit(1);
  }
  const assembled = sorobanRpc.assembleTransaction(baseTx, sim).build();
  assembled.sign(kp);

  console.log("Submitting...");
  const send = await rpcServer.sendTransaction(assembled);
  if (send.status !== "PENDING") {
    console.error(
      `Submit FAIL: ${send.status}  ${JSON.stringify(send.errorResult ?? {})}`,
    );
    process.exit(1);
  }
  console.log(`  hash=${send.hash}`);

  console.log("Confirming...");
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const status = await rpcServer.getTransaction(send.hash);
    if (status.status === sorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      console.log(`OK   confirmed at ledger=${status.ledger}`);
      console.log(
        `     https://stellar.expert/explorer/testnet/tx/${send.hash}`,
      );
      return;
    }
    if (status.status === sorobanRpc.Api.GetTransactionStatus.FAILED) {
      console.error(
        `FAIL: tx reverted  ${JSON.stringify(status.resultXdr ?? "")}`,
      );
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.error("FAIL: did not confirm within 60s.");
  process.exit(1);
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
