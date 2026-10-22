/**
 * Stellar to EVM bridge. Iris reports no forwarding state for Stellar
 * burns, so the EVM wallet signs `receiveMessage` once Iris attests.
 *
 * Soroban takes `amount` and `maxFee` in Stellar's 7-decimal subunits; the
 * contract drops the 7th decimal to produce the 6-decimal amount the CCTP
 * message carries.
 */
import { attestationPolling } from "./polling.js";
import {
  buildMintIntent,
  buildStellarApproveInvocation,
  buildStellarBurnIntent,
  canonicalToStellarSubunits,
  pollMessages,
  type BurnFeeTier,
  type EvmChain,
  type Network,
  type ForwarderFeeTier,
  type IrisMessage,
  type StellarChain,
} from "@usewhisk/cctp";
import { ConfigError, toWhiskError, WhiskError } from "../../errors/errors.js";
import type { Step, StepName } from "../../types/step.js";
import type {
  EvmAdapter,
  EvmCall,
  SendFailure,
  SendListeners,
  SendResult,
  StellarAdapter,
} from "../types.js";
import type { BridgeRecoverySnapshot } from "./execute.js";

export type ExecuteStellarToEvmInput = {
  network: Network;
  source: StellarChain;
  destination: EvmChain;
  recipientAddress: `0x${string}`;
  /** 6-decimal subunits, scaled to 7 on submit. */
  burnAmount: bigint;
  /** 6-decimal subunits, scaled to 7 on submit. */
  maxFee: bigint;
  burnFee: bigint;
  forwarderFee: bigint;
  tier: BurnFeeTier;
  forwarderLevel?: keyof ForwarderFeeTier;
  sourceAdapter: StellarAdapter;
  /** Signs `receiveMessage` on the EVM destination. */
  destinationAdapter: EvmAdapter;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  fetch?: typeof fetch;
};

const ALL_STEPS: StepName[] = ["approve", "burn", "fetchAttestation", "mint"];

export async function executeStellarToEvm(
  input: ExecuteStellarToEvmInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  if (!input.destinationAdapter || input.destinationAdapter.kind !== "evm") {
    throw new ConfigError(
      "executeStellarToEvm: destinationAdapter must be an EvmAdapter (Iris doesn't auto-forward Stellar burns).",
    );
  }
  const steps: Step[] = ALL_STEPS.map((name) => ({ name, state: "pending" }));
  // The approve goes in the same submission as the burn.
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

  // CCTP mintRecipient is 32 bytes: the 20-byte address left-padded.
  const mintRecipientBytes32 = new Uint8Array(32);
  const evmAddrHex = input.recipientAddress.slice(2);
  for (let i = 0; i < 20; i++) {
    mintRecipientBytes32[12 + i] = parseInt(
      evmAddrHex.slice(i * 2, i * 2 + 2),
      16,
    );
  }
  // A zero destinationCaller lets anyone call receiveMessage.
  const destCallerBytes32 = new Uint8Array(32);

  // No hook data: Circle doesn't forward Stellar burns, so it would only
  // cost Soroban fees.
  const stellarAmount = canonicalToStellarSubunits(input.burnAmount);
  const stellarMaxFee = canonicalToStellarSubunits(input.maxFee);

  let intent: ReturnType<typeof buildStellarBurnIntent>;
  try {
    intent = buildStellarBurnIntent({
      minFinalityThreshold: input.tier.finalityThreshold,
      source: input.source,
      destinationDomain: input.destination.cctpDomain,
      amount: stellarAmount,
      maxFee: stellarMaxFee,
      mintRecipientBytes32,
      destinationCallerBytes32: destCallerBytes32,
      caller: input.sourceAdapter.address,
    });
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to build Stellar burn intent.",
      snapshot,
    );
  }

  try {
    const network = await input.sourceAdapter.getNetwork();
    if (network !== input.source.stellarNetwork) {
      return fail(
        steps,
        "burn",
        new Error(
          `Wallet is on ${network}; expected ${input.source.stellarNetwork}.`,
        ),
        "Wrong Stellar network on the source wallet.",
        snapshot,
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to read Stellar network.",
      snapshot,
    );
  }

  // TokenMessengerMinter pulls the USDC with `transfer_from`, so it needs an
  // allowance. The SAC requires `live_until_ledger >= current ledger`, so a
  // static 0 fails; 720 ledgers is about an hour at 5s a ledger.
  let approveExpirationLedger: number;
  try {
    const latest = await input.sourceAdapter.getLatestLedger();
    approveExpirationLedger = latest + 720;
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to read Stellar latest ledger.",
      snapshot,
    );
  }
  const approveInvocation = buildStellarApproveInvocation({
    source: input.source,
    owner: input.sourceAdapter.address,
    spender: input.source.tokenMessengerMinter,
    amount: stellarAmount,
    expirationLedger: approveExpirationLedger,
  });

  let burnHash: string;
  try {
    const result = await input.sourceAdapter.submitInvocation([
      approveInvocation,
      intent.invocation,
    ]);
    const last = result.hashes[result.hashes.length - 1];
    if (!last) {
      return fail(
        steps,
        "burn",
        new Error("Stellar adapter returned no burn hash."),
        "Stellar adapter returned no burn hash.",
        snapshot,
      );
    }
    burnHash = last;
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed to submit Stellar burn.",
      snapshot,
    );
  }

  snapshot.burnTxHash = burnHash as `0x${string}`;
  listeners?.onBurnSubmitted?.(burnHash);
  steps[1] = { name: "burn", state: "pending", txHash: burnHash };
  listeners?.onStep?.(steps[1]);

  try {
    const receipt = await input.sourceAdapter.confirmTransaction(burnHash);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        "burn",
        new Error(`Stellar burn reverted (${burnHash}).`),
        "Stellar burn reverted.",
        snapshot,
        "reverted_onchain",
      );
    }
  } catch (cause) {
    return fail(
      steps,
      "burn",
      cause,
      "Failed waiting for Stellar burn confirmation.",
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
      {
        sourceDomain: input.source.cctpDomain,
        transactionHash: burnHash,
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
  if (
    message.status !== "complete" ||
    !message.message ||
    !message.attestation
  ) {
    return fail(
      steps,
      "fetchAttestation",
      new Error(
        `Attestation incomplete after polling window (status=${message.status}).`,
      ),
      "Attestation did not finalize in time.",
      snapshot,
      "polling_timeout",
    );
  }
  snapshot.message = message.message;
  snapshot.attestation = message.attestation;
  steps[2] = { name: "fetchAttestation", state: "success" };
  listeners?.onStep?.(steps[2]);

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
    const receipt = await destAdapter.waitForReceipt(mintHash);
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
