/**
 * One-off recovery: complete a bridge whose burn already landed and
 * whose Starknet destination `receive_message` never fired because the
 * engine's Iris poll window expired.
 *
 * Reads the burn hash + source domain from CLI, fetches the message +
 * attestation from Iris, signs `receive_message(message, attestation)`
 * on `MessageTransmitterV2` using WHISK_STARKNET_ADDRESS + PK.
 *
 * Usage:
 *   WHISK_STARKNET_ADDRESS=0x... WHISK_STARKNET_PK=0x... \
 *   WHISK_STARKNET_RPC=https://... \
 *   pnpm exec tsx scripts/recover-to-starknet.ts <sourceDomain> <burnHash>
 */
import { Account, RpcProvider } from "starknet";
import {
  buildStarknetReceiveIntent,
  pollMessages,
  StarknetSepolia,
} from "@usewhisk/cctp";

const sourceDomain = Number(process.argv[2]);
const burnHash = process.argv[3];
if (!Number.isFinite(sourceDomain) || !burnHash) {
  console.error("usage: recover-to-starknet.ts <sourceDomain> <burnHash>");
  process.exit(1);
}

const ADDRESS = process.env["WHISK_STARKNET_ADDRESS"];
const PK = process.env["WHISK_STARKNET_PK"];
const RPC =
  process.env["WHISK_STARKNET_RPC"] ?? StarknetSepolia.defaultRpcUrls[0]!;
if (!ADDRESS || !PK) {
  console.error("WHISK_STARKNET_ADDRESS and WHISK_STARKNET_PK required");
  process.exit(1);
}

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC, blockIdentifier: "latest" });
  const account = new Account({ provider, address: ADDRESS!, signer: PK! });
  console.log(`Starknet signer: ${account.address}`);
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

  const intent = buildStarknetReceiveIntent({
    destination: StarknetSepolia,
    message: message.message,
    attestation: message.attestation,
  });

  console.log("Submitting receive_message...");
  const nonce = await provider.getNonceForAddress(account.address, "latest");
  const result = await account.execute(
    [
      {
        contractAddress: intent.call.contractAddress,
        entrypoint: intent.call.entrypoint,
        calldata: intent.call.calldata,
      },
    ],
    { nonce, version: 3 },
  );
  console.log(`  hash=${result.transaction_hash}`);

  console.log("Confirming...");
  const receipt = await provider.waitForTransaction(result.transaction_hash, {
    retryInterval: 3000,
  });
  const success = "isSuccess" in receipt && receipt.isSuccess();
  console.log(success ? `OK   confirmed` : `FAIL   tx reverted`);
  console.log(
    `     https://sepolia.voyager.online/tx/${result.transaction_hash}`,
  );
  if (!success) process.exit(1);
}

main().catch((err) => {
  console.error("\nFATAL", err);
  process.exit(1);
});
