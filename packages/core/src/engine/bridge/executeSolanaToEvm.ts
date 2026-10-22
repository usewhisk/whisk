/**
 * Solana to EVM bridge. The burn is signed by the wallet and a fresh
 * keypair for `message_sent_event_data`. Circle's forwarder mints on the
 * EVM side, or with forwarding off the EVM wallet signs `receiveMessage`.
 * A forwarder FAILED state returns a failure with the recovery snapshot.
 */
import { attestationPolling } from "./polling.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  buildMintIntent,
  buildSolanaBurnIntent,
  CCTP_FORWARD_HOOK_DATA,
  isForwardDone,
  pollMessages,
  type BurnFeeTier,
  type EvmChain,
  type ForwarderFeeTier,
  type IrisMessage,
  type SolanaChain,
} from "@usewhisk/cctp";
import { toWhiskError, WhiskError } from "../../errors/errors.js";
import type { Step, StepName } from "../../types/step.js";
import type {
  EvmAdapter,
  EvmCall,
  SendFailure,
  SendListeners,
  SendResult,
  SolanaAdapter,
} from "../types.js";
import type { BridgeRecoverySnapshot } from "./execute.js";

export type ExecuteSolanaToEvmInput = {
  network: "mainnet" | "testnet";
  source: SolanaChain;
  destination: EvmChain;
  recipientAddress: `0x${string}`;
  burnAmount: bigint;
  maxFee: bigint;
  burnFee: bigint;
  forwarderFee: bigint;
  tier: BurnFeeTier;
  forwarderLevel?: keyof ForwarderFeeTier;
  useForwarder?: boolean;
  sourceAdapter: SolanaAdapter;
  /** Signs `receiveMessage` on the destination when forwarding is off. */
  destinationAdapter?: EvmAdapter;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  fetch?: typeof fetch;
};

const ALL_STEPS: StepName[] = ["approve", "burn", "fetchAttestation", "mint"];

export async function executeSolanaToEvm(
  input: ExecuteSolanaToEvmInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  const useForwarder = input.useForwarder ?? true;
  const steps: Step[] = ALL_STEPS.map((name) => ({ name, state: "pending" }));
  // Solana burns need no approve.
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

  const mintAdapter = useForwarder ? undefined : input.destinationAdapter;
  if (!useForwarder && !mintAdapter) {
    return fail(
      steps,
      "burn",
      new Error("An EVM wallet is needed to mint on the destination."),
      "An EVM wallet is needed to mint on the destination.",
      snapshot,
    );
  }

  const messageSentEventData = Keypair.generate();
  let owner: PublicKey;
  try {
    owner = new PublicKey(input.sourceAdapter.address);
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Source adapter has an invalid Solana pubkey.",
      snapshot,
    );
  }
  const usdcMint = new PublicKey(input.source.usdc);
  const ownerUsdcAta = getAssociatedTokenAddressSync(usdcMint, owner);

  // CCTP mintRecipient is 32 bytes: the 20-byte address left-padded.
  const mintRecipientBytes32 = new Uint8Array(32);
  const evmAddrHex = input.recipientAddress.slice(2);
  for (let i = 0; i < 20; i++) {
    mintRecipientBytes32[12 + i] = parseInt(
      evmAddrHex.slice(i * 2, i * 2 + 2),
      16,
    );
  }

  let intent: ReturnType<typeof buildSolanaBurnIntent>;
  try {
    intent = buildSolanaBurnIntent({
      minFinalityThreshold: input.tier.finalityThreshold,
      source: input.source,
      destinationDomain: input.destination.cctpDomain,
      amount: input.burnAmount,
      mintRecipientBytes32,
      maxFee: input.maxFee,
      owner,
      messageSentEventDataKey: messageSentEventData.publicKey,
      ownerUsdcAta,
      ...(useForwarder && {
        hookData: hexToBytes(CCTP_FORWARD_HOOK_DATA),
      }),
    });
  } catch (cause) {
    return fail(steps, "burn", cause, "Failed to build burn intent.", snapshot);
  }

  try {
    const cluster = await input.sourceAdapter.getCluster();
    if (cluster !== input.source.cluster) {
      const err = toWhiskError(
        new Error(`Wallet is on ${cluster}; expected ${input.source.cluster}.`),
        "Wrong Solana cluster.",
      );
      return fail(steps, "burn", err, err.message, snapshot);
    }
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to read Solana cluster.",
      snapshot,
    );
  }

  let burnSignature: string;
  try {
    const result = await input.sourceAdapter.sendTransaction(
      [intent.instruction],
      {
        extraSigners: [
          {
            publicKey: messageSentEventData.publicKey.toBase58(),
            secretKey: messageSentEventData.secretKey,
          },
        ],
      },
    );
    burnSignature = result.signature;
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to submit Solana burn.",
      snapshot,
    );
  }

  snapshot.burnTxHash = burnSignature as `0x${string}`;
  listeners?.onBurnSubmitted?.(burnSignature);
  steps[1] = { name: "burn", state: "pending", txHash: burnSignature };
  listeners?.onStep?.(steps[1]);

  try {
    const receipt = await input.sourceAdapter.confirmTransaction(burnSignature);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        "burn",
        new Error(`Burn reverted on Solana (${burnSignature}).`),
        "Burn reverted on Solana.",
        snapshot,
        "reverted_onchain",
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed waiting for burn confirmation.",
      snapshot,
    );
  }
  steps[1] = { name: "burn", state: "success", txHash: burnSignature };
  listeners?.onStep?.(steps[1]);

  steps[2] = { name: "fetchAttestation", state: "pending" };
  listeners?.onStep?.(steps[2]);

  let message: IrisMessage | null;
  try {
    message = await pollMessages(
      {
        sourceDomain: input.source.cctpDomain,
        transactionHash: burnSignature,
      },
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
      new Error("Timed out waiting for the attestation."),
      "Timed out waiting for the attestation.",
      snapshot,
      "polling_timeout",
    );
  }
  snapshot.message = message.message;
  snapshot.attestation = message.attestation;
  steps[2] = { name: "fetchAttestation", state: "success" };
  listeners?.onStep?.(steps[2]);

  if (mintAdapter) {
    return mintWithAdapter(
      mintAdapter,
      input.destination,
      message,
      steps,
      snapshot,
      listeners,
    );
  }

  const forwardComplete = useForwarder && isForwardDone(message);
  const forwardFailed = message.forwardState === "FAILED";

  if (forwardComplete) {
    snapshot.forwardTxHash = message.forwardTxHash ?? undefined;
    steps[3] = {
      name: "mint",
      state: "success",
      forwarded: true,
      ...(message.forwardTxHash ? { txHash: message.forwardTxHash } : {}),
    };
    listeners?.onStep?.(steps[3]);
    return {
      kind: "success",
      ...(message.forwardTxHash && { finalTxHash: message.forwardTxHash }),
      steps,
    };
  }

  if (forwardFailed) {
    return fail(
      steps,
      "mint",
      new Error("Forwarder reported FAILED on the EVM mint."),
      "Forwarder reported FAILED. Use the snapshot to recover manually.",
      snapshot,
      "failed_offchain",
    );
  }

  return fail(
    steps,
    "mint",
    new Error(
      `Forwarder did not finalize within the polling window (state=${
        message.forwardState ?? "unknown"
      }).`,
    ),
    "Forwarder did not finalize in time.",
    snapshot,
    "polling_timeout",
  );
}

async function mintWithAdapter(
  adapter: EvmAdapter,
  destination: EvmChain,
  message: IrisMessage,
  steps: Step[],
  snapshot: BridgeRecoverySnapshot,
  listeners?: SendListeners,
): Promise<SendResult> {
  let mintCall: EvmCall;
  try {
    mintCall = buildMintIntent({
      destination,
      message: message.message,
      attestation: message.attestation,
    }).call;
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to build mint calldata.",
      snapshot,
    );
  }

  try {
    if ((await adapter.getChainId()) !== destination.evmChainId) {
      await adapter.switchChain(destination.evmChainId);
    }
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to switch to destination chain.",
      snapshot,
    );
  }

  let mintHash: `0x${string}`;
  try {
    const { hashes } = await adapter.sendCalls([mintCall]);
    const last = hashes[hashes.length - 1];
    if (!last) {
      return fail(
        steps,
        "mint",
        new Error("Destination adapter returned no transaction hash."),
        "Destination adapter returned no transaction hash.",
        snapshot,
      );
    }
    mintHash = last;
  } catch (cause) {
    return fail(steps, "mint", cause, "Failed to submit mint.", snapshot);
  }

  steps[3] = {
    name: "mint",
    state: "pending",
    txHash: mintHash,
    forwarded: false,
  };
  listeners?.onStep?.(steps[3]);
  try {
    const receipt = await adapter.waitForReceipt(mintHash);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        "mint",
        new Error(`Mint reverted on-chain (${mintHash}).`),
        "Mint reverted on-chain.",
        snapshot,
        "reverted_onchain",
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed waiting for mint receipt.",
      snapshot,
    );
  }
  steps[3] = {
    name: "mint",
    state: "success",
    txHash: mintHash,
    forwarded: false,
  };
  listeners?.onStep?.(steps[3]);
  return { kind: "success", finalTxHash: mintHash, steps };
}

function hexToBytes(hex: `0x${string}`): Uint8Array {
  const stripped = hex.slice(2);
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
  return {
    kind: "failure",
    error,
    steps,
    raw: snapshot,
  };
}
