/**
 * Starknet → EVM bridge executor.
 *
 * Flow:
 *   1. Starknet source: multicall [approve(usdc, TMM, amount),
 *      deposit_for_burn(...)]. Starknet accounts execute multicalls
 *      atomically, so no inter-call wait is needed.
 *   2. Iris attests the burn. Iris's auto-forwarder doesn't relay
 *      Starknet-source burns — there's no `forwardState` field on the
 *      message response.
 *   3. Destination EVM wallet signs `receiveMessage(message, attestation)`
 *      on MessageTransmitter.
 */
import { attestationPolling } from "./polling.js";
import {
  buildMintIntent,
  buildStarknetApproveCall,
  buildStarknetBurnIntent,
  pollMessages,
  type BurnFeeTier,
  type Network,
  type EvmChain,
  type ForwarderFeeTier,
  type IrisMessage,
  type StarknetChain,
} from "@usewhisk/cctp";
import { ConfigError, toWhiskError, WhiskError } from "../../errors/errors.js";
import type { Step, StepName } from "../../types/step.js";
import type {
  EvmAdapter,
  EvmCall,
  SendFailure,
  SendListeners,
  SendResult,
  StarknetAdapter,
} from "../types.js";
import type { BridgeRecoverySnapshot } from "./execute.js";

export type ExecuteStarknetToEvmInput = {
  network: Network;
  source: StarknetChain;
  destination: EvmChain;
  recipientAddress: `0x${string}`;
  burnAmount: bigint;
  maxFee: bigint;
  burnFee: bigint;
  forwarderFee: bigint;
  tier: BurnFeeTier;
  forwarderLevel?: keyof ForwarderFeeTier;
  sourceAdapter: StarknetAdapter;
  destinationAdapter: EvmAdapter;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  fetch?: typeof fetch;
};

const ALL_STEPS: StepName[] = ["approve", "burn", "fetchAttestation", "mint"];

export async function executeStarknetToEvm(
  input: ExecuteStarknetToEvmInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  if (!input.destinationAdapter || input.destinationAdapter.kind !== "evm") {
    throw new ConfigError(
      "executeStarknetToEvm: destinationAdapter must be an EvmAdapter.",
    );
  }

  const steps: Step[] = ALL_STEPS.map((name) => ({ name, state: "pending" }));
  const snapshot: BridgeRecoverySnapshot = {
    kind: "bridge",
    network: input.network,
    sourceDomain: input.source.cctpDomain,
    destinationDomain: input.destination.cctpDomain,
    burnAmount: input.burnAmount.toString(),
    maxFee: input.maxFee.toString(),
    recipientAddress: input.recipientAddress,
  };

  // mintRecipient = EVM address left-padded to 32 bytes, packed into a u256.
  const evmAddrHex = input.recipientAddress.slice(2);
  const mintRecipientU256 = BigInt("0x" + evmAddrHex.padStart(64, "0"));

  // Build approve + burn calls (multicall).
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
        new Error(`wallet on ${liveChainId}; expected ${input.source.chainId}`),
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

  // Multicall — Starknet accounts execute atomically.
  steps[0] = { name: "approve", state: "noop" }; // bundled with burn
  listeners?.onStep?.(steps[0]);

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

  // Manual EVM mint.
  const destAdapter = input.destinationAdapter;
  let mintCalldata: EvmCall;
  try {
    const mintIntent = buildMintIntent({
      destination: input.destination,
      message: message.message,
      attestation: message.attestation,
    });
    mintCalldata = mintIntent.call;
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
    const live = await destAdapter.getChainId();
    if (live !== input.destination.evmChainId) {
      await destAdapter.switchChain(input.destination.evmChainId);
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
    const { hashes } = await destAdapter.sendCalls([mintCalldata]);
    const last = hashes[hashes.length - 1];
    if (!last) {
      return fail(
        steps,
        "mint",
        new Error("no hash"),
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
    const receipt = await destAdapter.waitForReceipt(mintHash);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        "mint",
        new Error(`reverted: ${mintHash}`),
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
