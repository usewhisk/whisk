/**
 * Stellar → EVM bridge executor.
 *
 * Iris's auto-forwarder ("Forwarding Service") does NOT relay
 * Stellar-source burns — the Iris message response omits the
 * `forwardState` field entirely. So the recipient (or any party) MUST
 * call `receiveMessage` on the EVM `MessageTransmitter` manually.
 *
 * Flow:
 *   1. Stellar source signs USDC SAC `approve` (TMM uses transfer_from).
 *   2. Stellar source signs `deposit_for_burn` (no hookData).
 *   3. Iris attests the burn.
 *   4. Destination EVM wallet signs `receiveMessage(message, attestation)`
 *      on the `MessageTransmitter` to mint USDC.
 *
 * `amount` and `maxFee` are passed to Soroban in 7-decimal Stellar
 * subunits. The contract drops the 7th decimal to produce the 6-decimal
 * canonical amount the CCTP message carries.
 */
import {
  buildMintIntent,
  buildStellarApproveInvocation,
  buildStellarBurnIntent,
  canonicalToStellarSubunits,
  pollMessages,
  type BurnFeeTier,
  type EvmCctpChain,
  type CctpNetwork,
  type ForwarderFeeTier,
  type IrisMessage,
  type StellarCctpChain,
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
  network: CctpNetwork;
  source: StellarCctpChain;
  destination: EvmCctpChain;
  /** Recipient EVM 0x-address on the destination chain. */
  recipientAddress: `0x${string}`;
  /** Burn amount in 6-decimal canonical subunits. Scaled to 7 on submit. */
  burnAmount: bigint;
  /** Max fee in 6-decimal canonical subunits. Scaled to 7 on submit. */
  maxFee: bigint;
  burnFee: bigint;
  forwarderFee: bigint;
  tier: BurnFeeTier;
  forwarderLevel?: keyof ForwarderFeeTier;
  sourceAdapter: StellarAdapter;
  /** REQUIRED — signs `receiveMessage` on the EVM destination. */
  destinationAdapter: EvmAdapter;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
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
  steps[0] = { name: "approve", state: "noop" }; // approve+burn submitted together via Stellar adapter
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

  // The EVM destination expects the recipient in mintRecipient bytes32.
  // 20-byte 0x-address left-padded with 12 zero bytes.
  const mintRecipientBytes32 = new Uint8Array(32);
  const evmAddrHex = input.recipientAddress.slice(2);
  for (let i = 0; i < 20; i++) {
    mintRecipientBytes32[12 + i] = parseInt(
      evmAddrHex.slice(i * 2, i * 2 + 2),
      16,
    );
  }
  // destinationCaller = 32 zero bytes (any caller — the EVM Forwarder).
  const destCallerBytes32 = new Uint8Array(32);

  // Build the burn intent. Amounts in 7-decimal Stellar subunits.
  // No hookData — Iris's auto-forwarder doesn't process Stellar-source
  // burns, so the canonical `cctp-forward` magic would be a no-op and
  // wastes Soroban gas. We mint manually on the EVM side.
  const stellarAmount = canonicalToStellarSubunits(input.burnAmount);
  const stellarMaxFee = canonicalToStellarSubunits(input.maxFee);

  let intent: ReturnType<typeof buildStellarBurnIntent>;
  try {
    intent = buildStellarBurnIntent({
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

  // Prepend USDC SAC approve — TMM uses `transfer_from` which checks
  // the caller→TMM allowance. Stellar SAC requires
  // `live_until_ledger >= current ledger`, so a static 0 fails. Use
  // current + 720 ledgers (~1 hr at 5s/ledger) as a tight window.
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

  // Poll Iris.
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
        ...(input.pollIntervalMs !== undefined && {
          intervalMs: input.pollIntervalMs,
        }),
        ...(input.pollTimeoutMs !== undefined && {
          timeoutMs: input.pollTimeoutMs,
        }),
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
  if (message.status === "failed") {
    return fail(
      steps,
      "fetchAttestation",
      new Error(
        `Iris reported attestation failure: ${message.delayReason ?? "no reason given"}.`,
      ),
      "Iris reported attestation failure.",
      snapshot,
      "failed_offchain",
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

  // Manual EVM mint — destinationAdapter signs `receiveMessage` on the
  // destination MessageTransmitter.
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
