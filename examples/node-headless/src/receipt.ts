/**
 * Poll a settlement status from Node — same primitives `<WhiskReceipt>`
 * uses, minus the React state.
 *
 * Useful for a fulfilment worker that's tracking long-running bridges
 * and writing status back to your DB without keeping a browser tab open.
 *
 * Usage:
 *   SOURCE_CHAIN=Base_Sepolia DEST_CHAIN=Arc_Testnet TX=0x... pnpm receipt
 */
import {
  deriveReceiptView,
  pollAttestation,
  RECEIPT_STAGE_LABELS,
  type Chain,
} from "@usewhisk/core";
import { env } from "./env.js";

const sourceChain = env.required("SOURCE_CHAIN") as Chain;
const destinationChain = env.required("DEST_CHAIN") as Chain;
const sourceTxHash = env.required("TX");

async function main() {
  if (sourceChain === destinationChain) {
    const view = deriveReceiptView({
      sourceChain,
      destinationChain,
      sourceTxHash,
    });
    console.log(`Stage: ${RECEIPT_STAGE_LABELS[view.stage]}`);
    console.log(`Source: ${view.sourceExplorerUrl}`);
    return;
  }

  console.log(
    `Polling Iris for ${sourceChain} → ${destinationChain} bridge…\n`,
  );

  const final = await pollAttestation(sourceChain, sourceTxHash, {
    pollingInterval: 5000,
    timeout: 15 * 60 * 1000,
    onUpdate: (msg) => {
      const view = deriveReceiptView({
        sourceChain,
        destinationChain,
        sourceTxHash,
        irisStatus: msg.status,
      });
      console.log(
        `  iris=${msg.status}  →  stage=${RECEIPT_STAGE_LABELS[view.stage]}`,
      );
    },
  });

  const view = deriveReceiptView({
    sourceChain,
    destinationChain,
    sourceTxHash,
    irisStatus: final.status,
  });

  console.log(`\nFinal stage: ${RECEIPT_STAGE_LABELS[view.stage]}`);
  console.log(`Source tx: ${view.sourceExplorerUrl}`);
  if (final.attestation) {
    console.log(`Attestation: ready (${final.attestation.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
