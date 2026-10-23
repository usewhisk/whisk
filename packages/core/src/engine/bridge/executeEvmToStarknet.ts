/**
 * EVM to Starknet bridge. Circle's Forwarding Service does not cover
 * Starknet, so the Starknet wallet signs `receive_message` once Iris attests.
 */
import { attestationPolling } from "./polling.js";
import { evmBurnCalls, type UpfrontFee } from "./upfront.js";
import {
  feltToBytes32Hex,
  buildStarknetReceiveIntent,
  pollMessages,
  type BurnFeeTier,
  type EvmChain,
  type Network,
  type IrisMessage,
  type StarknetChain,
  type StarknetFelt,
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
import { starknetRecipientProblem } from "./starknetRecipient.js";

export type ExecuteEvmToStarknetInput = {
  network: Network;
  source: EvmChain;
  destination: StarknetChain;
  recipientAddress: string;
  burnAmount: bigint;
  maxFee: bigint;
  burnFee: bigint;
  forwarderFee: bigint;
  tier: BurnFeeTier;
  customFeeCalls?: EvmCall[];
  sourceAdapter: EvmAdapter;
  /** Set when the fees are paid upfront from Circle's signed quote. */
  upfront?: UpfrontFee;
  /** Signs `receive_message` on Starknet. */
  destinationAdapter: StarknetAdapter;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  fetch?: typeof fetch;
};

const ALL_STEPS: StepName[] = ["approve", "burn", "fetchAttestation", "mint"];

export async function executeEvmToStarknet(
  input: ExecuteEvmToStarknetInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  if (
    !input.destinationAdapter ||
    input.destinationAdapter.kind !== "starknet"
  ) {
    throw new ConfigError(
      "executeEvmToStarknet: destinationAdapter must be a StarknetAdapter.",
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

  const recipientFelt = input.recipientAddress as StarknetFelt;
  const mintRecipientBytes32 = feltToBytes32Hex(recipientFelt);

  let burnCalls: EvmCall[];
  try {
    burnCalls = evmBurnCalls(
      {
        source: input.source,
        destination: input.destination,
        amount: input.burnAmount,
        mintRecipient: mintRecipientBytes32,
        fee: { tier: input.tier, maxFee: input.maxFee },
        withForwarder: false,
      },
      input.upfront,
      input.sourceAdapter.address,
    );
  } catch (cause) {
    return fail(
      steps,
      "approve",
      cause,
      "Failed to build burn intent.",
      snapshot,
    );
  }

  const destinationProblem = await starknetRecipientProblem(
    input.destination,
    input.destinationAdapter,
  );
  if (destinationProblem) {
    return fail(
      steps,
      "approve",
      destinationProblem,
      destinationProblem.message,
      snapshot,
    );
  }

  const customFeeCalls = input.customFeeCalls ?? [];
  const submittedCalls: EvmCall[] = [...customFeeCalls, ...burnCalls];
  const customFeeOffset = customFeeCalls.length;

  try {
    const live = await input.sourceAdapter.getChainId();
    if (live !== input.source.evmChainId) {
      await input.sourceAdapter.switchChain(input.source.evmChainId);
    }
  } catch (cause) {
    return fail(
      steps,
      "approve",
      cause,
      "Failed to switch to source chain.",
      snapshot,
    );
  }

  const hasApprove = burnCalls.length === 2;
  let approveHash: `0x${string}` | undefined;
  let burnHash: `0x${string}`;
  const customFeeHashes: `0x${string}`[] = [];
  try {
    const { hashes } = await input.sourceAdapter.sendCalls(submittedCalls, {
      // The burn is the last call, or the whole batch when it shares a hash.
      onSubmitted: (hash, index) => {
        if (index === submittedCalls.length - 1) {
          listeners?.onBurnSubmitted?.(hash);
        }
      },
    });
    if (hashes.length === 0) {
      return fail(
        steps,
        hasApprove ? "approve" : "burn",
        new Error("no tx hash"),
        "Source adapter returned no transaction hash.",
        snapshot,
      );
    }
    if (hashes.length === 1) {
      burnHash = hashes[0] as `0x${string}`;
      if (hasApprove) approveHash = burnHash;
      if (customFeeOffset > 0) customFeeHashes.push(burnHash);
    } else {
      for (let i = 0; i < customFeeOffset; i++) {
        customFeeHashes.push(hashes[i] as `0x${string}`);
      }
      if (hasApprove) approveHash = hashes[customFeeOffset] as `0x${string}`;
      burnHash = hashes[hashes.length - 1] as `0x${string}`;
    }
  } catch (cause) {
    return fail(
      steps,
      hasApprove ? "approve" : "burn",
      cause,
      "Failed to submit burn.",
      snapshot,
    );
  }

  // Saved before any receipt wait, which can outlive the tab.
  listeners?.onBurnSubmitted?.(burnHash);

  for (const hash of customFeeHashes) {
    if (hash === burnHash) continue;
    try {
      const receipt = await input.sourceAdapter.waitForReceipt(hash);
      if (receipt.status === "reverted") {
        return fail(
          steps,
          "approve",
          new Error(`reverted: ${hash}`),
          "Merchant fee transfer reverted on-chain.",
          snapshot,
          "reverted_onchain",
        );
      }
    } catch (cause) {
      return fail(
        steps,
        "approve",
        cause,
        "Failed waiting for merchant fee receipt.",
        snapshot,
      );
    }
  }

  if (hasApprove && approveHash) {
    if (approveHash === burnHash) {
      steps[0] = { name: "approve", state: "success", txHash: approveHash };
    } else {
      steps[0] = { name: "approve", state: "pending", txHash: approveHash };
      listeners?.onStep?.(steps[0]);
      try {
        const receipt = await input.sourceAdapter.waitForReceipt(approveHash);
        if (receipt.status === "reverted") {
          return fail(
            steps,
            "approve",
            new Error("approve reverted"),
            "Approve reverted on-chain.",
            { ...snapshot, burnTxHash: approveHash },
            "reverted_onchain",
          );
        }
        steps[0] = { name: "approve", state: "success", txHash: approveHash };
      } catch (cause) {
        return fail(
          steps,
          "approve",
          cause,
          "Failed waiting for approve receipt.",
          snapshot,
        );
      }
    }
    listeners?.onStep?.(steps[0]);
  } else {
    steps[0] = { name: "approve", state: "noop" };
    listeners?.onStep?.(steps[0]);
  }

  snapshot.burnTxHash = burnHash;
  steps[1] = { name: "burn", state: "pending", txHash: burnHash };
  listeners?.onStep?.(steps[1]);
  try {
    const receipt = await input.sourceAdapter.waitForReceipt(burnHash);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        "burn",
        new Error("burn reverted"),
        "Burn reverted on-chain.",
        snapshot,
        "reverted_onchain",
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed waiting for burn receipt.",
      snapshot,
    );
  }
  steps[1] = { name: "burn", state: "success", txHash: burnHash };
  listeners?.onStep?.(steps[1]);

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

  let receiveIntent;
  try {
    receiveIntent = buildStarknetReceiveIntent({
      destination: input.destination,
      message: message.message,
      attestation: message.attestation,
    });
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to build Starknet receive call.",
      snapshot,
    );
  }

  try {
    const liveChainId = await input.destinationAdapter.getChainId();
    if (liveChainId !== input.destination.chainId) {
      return fail(
        steps,
        "mint",
        new Error(`wrong chain: ${liveChainId}`),
        `Destination Starknet wallet is on chainId=${liveChainId}; expected ${input.destination.chainId}.`,
        snapshot,
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to read Starknet chainId.",
      snapshot,
    );
  }

  let mintHash: string;
  try {
    const result = await input.destinationAdapter.submitCalls([
      receiveIntent.call,
    ]);
    const last = result.hashes[result.hashes.length - 1];
    if (!last) {
      return fail(
        steps,
        "mint",
        new Error("no hash"),
        "Starknet adapter returned no transaction hash.",
        snapshot,
      );
    }
    mintHash = last;
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed to submit Starknet receive_message.",
      snapshot,
    );
  }
  steps[3] = {
    name: "mint",
    state: "pending",
    txHash: mintHash,
    forwarded: false,
  };
  listeners?.onStep?.(steps[3]);

  try {
    const receipt = await input.destinationAdapter.confirmTransaction(mintHash);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        "mint",
        new Error(`reverted: ${mintHash}`),
        "Starknet receive_message reverted.",
        snapshot,
        "reverted_onchain",
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "mint",
      cause,
      "Failed waiting for Starknet mint confirmation.",
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
