/**
 * Starknet → Solana bridge executor.
 *
 * Starknet source: approve + deposit_for_burn multicall (mintRecipient =
 * recipient's USDC ATA on Solana, packed as u256). Iris attests. Destination
 * Solana wallet signs `receive_message` directly to the recipient ATA.
 */
import { attestationPolling } from "./polling.js";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  buildSolanaReceiveIntent,
  buildStarknetApproveCall,
  buildStarknetBurnIntent,
  decodeStrkeyToBytes32,
  deriveTokenMessenger,
  feltToBigInt,
  parseTokenMessengerFeeRecipient,
  pollMessages,
  toBytes32,
  type BurnFeeTier,
  type Network,
  type ForwarderFeeTier,
  type IrisMessage,
  type SolanaChain,
  type StarknetChain,
  type StarknetFelt,
} from "@usewhisk/cctp";
import { ConfigError, toWhiskError, WhiskError } from "../../errors/errors.js";
import type { Step, StepName } from "../../types/step.js";
import type {
  SendFailure,
  SendListeners,
  SendResult,
  SolanaAdapter,
  StarknetAdapter,
} from "../types.js";
import type { BridgeRecoverySnapshot } from "./execute.js";

export type ExecuteStarknetToSolanaInput = {
  network: Network;
  source: StarknetChain;
  destination: SolanaChain;
  recipientAddress: string;
  burnAmount: bigint;
  maxFee: bigint;
  burnFee: bigint;
  forwarderFee: bigint;
  tier: BurnFeeTier;
  forwarderLevel?: keyof ForwarderFeeTier;
  sourceAdapter: StarknetAdapter;
  destinationAdapter: SolanaAdapter;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  fetch?: typeof fetch;
};

const ALL_STEPS: StepName[] = ["approve", "burn", "fetchAttestation", "mint"];

export async function executeStarknetToSolana(
  input: ExecuteStarknetToSolanaInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  if (!input.destinationAdapter || input.destinationAdapter.kind !== "solana") {
    throw new ConfigError(
      "executeStarknetToSolana: destinationAdapter must be a SolanaAdapter.",
    );
  }

  const steps: Step[] = ALL_STEPS.map((name) => ({ name, state: "pending" }));
  steps[0] = { name: "approve", state: "noop" };
  listeners?.onStep?.(steps[0]);

  const snapshot: BridgeRecoverySnapshot = {
    kind: "bridge",
    network: input.network,
    sourceDomain: input.source.cctpDomain,
    destinationDomain: input.destination.cctpDomain,
    burnAmount: input.burnAmount.toString(),
    maxFee: input.maxFee.toString(),
    recipientAddress: input.recipientAddress,
  };

  // mintRecipient = recipient's USDC ATA on Solana (CCTP V2 Solana
  // enforces recipient_token_account.key() == mint_recipient).
  let recipientUsdcAta: PublicKey;
  try {
    recipientUsdcAta = getAssociatedTokenAddressSync(
      new PublicKey(input.destination.usdc),
      new PublicKey(input.recipientAddress),
    );
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Invalid Solana recipient pubkey.",
      snapshot,
    );
  }
  const mintRecipientU256 = BigInt(
    "0x" +
      Array.from(recipientUsdcAta.toBytes(), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
  );

  let approveCall, burnIntent;
  try {
    approveCall = buildStarknetApproveCall({
      source: input.source,
      spender: input.source.tokenMessengerMinter,
      amount: input.burnAmount,
    });
    burnIntent = buildStarknetBurnIntent({
      minFinalityThreshold: input.tier.finalityThreshold,
      source: input.source,
      destinationDomain: input.destination.cctpDomain,
      amount: input.burnAmount,
      maxFee: input.maxFee,
      mintRecipient: mintRecipientU256,
      destinationCaller: 0n,
    });
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to build Starknet burn calls.",
      snapshot,
    );
  }

  try {
    const liveChainId = await input.sourceAdapter.getChainId();
    if (liveChainId !== input.source.chainId) {
      return fail(
        steps,
        "burn",
        new Error(`wallet on ${liveChainId}`),
        "Wrong Starknet chainId on source wallet.",
        snapshot,
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to read Starknet chainId.",
      snapshot,
    );
  }

  let burnHash: string;
  try {
    const { hashes } = await input.sourceAdapter.submitCalls([
      approveCall,
      burnIntent.call,
    ]);
    const last = hashes[hashes.length - 1];
    if (!last) {
      return fail(
        steps,
        "burn",
        new Error("no hash"),
        "Starknet adapter returned no tx hash.",
        snapshot,
      );
    }
    burnHash = last;
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to submit Starknet approve+burn.",
      snapshot,
    );
  }
  snapshot.burnTxHash = burnHash as `0x${string}`;
  steps[1] = { name: "burn", state: "pending", txHash: burnHash };
  listeners?.onStep?.(steps[1]);

  try {
    const receipt = await input.sourceAdapter.confirmTransaction(burnHash);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        "burn",
        new Error(`reverted: ${burnHash}`),
        "Starknet burn reverted.",
        snapshot,
        "reverted_onchain",
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed waiting for Starknet burn confirmation.",
      snapshot,
    );
  }
  steps[1] = { name: "burn", state: "success", txHash: burnHash };
  listeners?.onStep?.(steps[1]);

  // Iris poll.
  steps[2] = { name: "fetchAttestation", state: "pending" };
  listeners?.onStep?.(steps[2]);
  let message: IrisMessage | null;
  try {
    message = await pollMessages(
      { sourceDomain: input.source.cctpDomain, transactionHash: burnHash },
      {
        network: input.network,
        ...(input.fetch && { fetch: input.fetch }),
        ...attestationPolling(input),
      },
    );
  } catch (cause) {
    return fail(
      steps,
      "fetchAttestation",
      cause,
      "Failed to fetch attestation.",
      snapshot,
    );
  }
  if (!message) {
    return fail(
      steps,
      "fetchAttestation",
      new Error("timeout"),
      "Timed out waiting for the attestation.",
      snapshot,
      "polling_timeout",
    );
  }
  if (
    message.status !== "complete" ||
    !message.message ||
    !message.attestation
  ) {
    return fail(
      steps,
      "fetchAttestation",
      new Error(`incomplete: ${message.status}`),
      "Attestation did not finalize in time.",
      snapshot,
      "polling_timeout",
    );
  }
  snapshot.message = message.message;
  snapshot.attestation = message.attestation;
  steps[2] = { name: "fetchAttestation", state: "success" };
  listeners?.onStep?.(steps[2]);

  // Solana receive — same flow as EVM→Solana.
  const destAdapter = input.destinationAdapter;
  try {
    const cluster = await destAdapter.getCluster();
    if (cluster !== input.destination.cluster) {
      return fail(
        steps,
        "mint",
        new Error(`wrong cluster: ${cluster}`),
        "Wrong Solana cluster on destination.",
        snapshot,
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to read Solana cluster.",
      snapshot,
    );
  }

  try {
    const ataInfo = await destAdapter.getAccountInfo(
      recipientUsdcAta.toBase58(),
    );
    if (!ataInfo) {
      return fail(
        steps,
        "mint",
        new Error(`ATA missing: ${recipientUsdcAta.toBase58()}`),
        "Recipient USDC ATA missing on Solana.",
        snapshot,
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to verify recipient ATA exists.",
      snapshot,
    );
  }

  const tmmProgram = new PublicKey(input.destination.tokenMessengerMinter);
  const tokenMessengerPda = deriveTokenMessenger(tmmProgram);
  let feeRecipient: PublicKey;
  try {
    const info = await destAdapter.getAccountInfo(tokenMessengerPda.toBase58());
    if (!info) {
      return fail(
        steps,
        "mint",
        new Error("TokenMessenger PDA missing"),
        "Solana TokenMessenger state missing.",
        snapshot,
      );
    }
    feeRecipient = parseTokenMessengerFeeRecipient(info.data);
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to read TokenMessenger state.",
      snapshot,
    );
  }
  const feeRecipientUsdcAta = getAssociatedTokenAddressSync(
    new PublicKey(input.destination.usdc),
    feeRecipient,
  );

  // Source-token bytes32 = Starknet USDC felt zero-extended.
  let sourceTokenBytes32: Uint8Array;
  try {
    const usdcFelt = feltToBigInt(input.source.usdc as StarknetFelt);
    sourceTokenBytes32 = bigIntToBytes32(usdcFelt);
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to encode source token as bytes32.",
      snapshot,
    );
  }

  let receiveInstruction;
  try {
    const ri = buildSolanaReceiveIntent({
      destination: input.destination,
      message: hexToBytes(message.message),
      attestation: hexToBytes(message.attestation),
      sourceDomain: input.source.cctpDomain,
      sourceTokenBytes32,
      feeRecipientUsdcAta,
      recipientUsdcAta,
      payer: new PublicKey(destAdapter.address),
    });
    receiveInstruction = ri.instruction;
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to build Solana receive instruction.",
      snapshot,
    );
  }

  let mintSignature: string;
  try {
    const result = await destAdapter.sendTransaction([receiveInstruction]);
    mintSignature = result.signature;
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to submit Solana receive_message.",
      snapshot,
    );
  }
  steps[3] = {
    name: "mint",
    state: "pending",
    txHash: mintSignature,
    forwarded: false,
  };
  listeners?.onStep?.(steps[3]);

  try {
    const receipt = await destAdapter.confirmTransaction(mintSignature);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        "mint",
        new Error(`reverted: ${mintSignature}`),
        "Solana mint reverted.",
        snapshot,
        "reverted_onchain",
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed waiting for Solana mint confirmation.",
      snapshot,
    );
  }
  steps[3] = {
    name: "mint",
    state: "success",
    txHash: mintSignature,
    forwarded: false,
  };
  listeners?.onStep?.(steps[3]);

  void toBytes32;
  void decodeStrkeyToBytes32;
  return { kind: "success", finalTxHash: mintSignature, steps };
}

function bigIntToBytes32(value: bigint): Uint8Array {
  let hex = value.toString(16);
  if (hex.length > 64) {
    throw new Error("value exceeds 32 bytes");
  }
  hex = hex.padStart(64, "0");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function hexToBytes(hex: `0x${string}` | string): Uint8Array {
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function fail(
  steps: Step[],
  stepName: StepName,
  cause: unknown,
  fallbackMessage: string,
  snapshot: BridgeRecoverySnapshot,
  category?: Parameters<typeof toWhiskError>[2],
): SendFailure {
  const error: WhiskError = toWhiskError(cause, fallbackMessage, category);
  const idx = steps.findIndex((s) => s.name === stepName);
  if (idx !== -1) {
    const prev = steps[idx];
    if (prev) {
      const next: Step = {
        ...prev,
        state: "error",
        errorMessage: error.message,
      };
      if (error.category) next.errorCategory = error.category;
      steps[idx] = next;
    }
  }
  return { kind: "failure", error, steps, raw: snapshot };
}
