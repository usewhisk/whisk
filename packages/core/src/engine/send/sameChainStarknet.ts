import {
  assertStarknetFelt,
  u256ToFelts,
  type StarknetChain,
  type StarknetCall,
} from "@usewhisk/cctp";
import {
  InvalidAddressError,
  toWhiskError,
  WhiskError,
} from "../../errors/errors.js";
import type { Step } from "../../types/step.js";
import type { SendListeners, SendResult, StarknetAdapter } from "../types.js";

export type ExecuteSameChainStarknetSendInput = {
  chain: StarknetChain;
  /** felt252 hex. */
  recipientAddress: string;
  /** 6-decimal subunits. */
  amount: bigint;
  adapter: StarknetAdapter;
};

export async function executeSameChainStarknetSend(
  input: ExecuteSameChainStarknetSendInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  const steps: Step[] = [
    { name: "approve", state: "noop" },
    { name: "burn", state: "pending" },
    { name: "fetchAttestation", state: "noop" },
    { name: "mint", state: "noop" },
  ];
  listeners?.onStep?.(steps[0]!);

  let recipient: string;
  try {
    recipient = assertStarknetFelt(input.recipientAddress);
  } catch (cause) {
    return fail(
      steps,
      new InvalidAddressError(input.recipientAddress),
      cause instanceof Error ? cause.message : "Invalid Starknet recipient.",
    );
  }

  try {
    const liveChainId = await input.adapter.getChainId();
    if (liveChainId !== input.chain.chainId) {
      const err = toWhiskError(
        new Error(
          `Wallet is on chainId=${liveChainId}; expected ${input.chain.chainId}.`,
        ),
        "Wrong Starknet network.",
      );
      return fail(steps, err, err.message);
    }
  } catch (cause) {
    return fail(steps, cause, "Failed to read Starknet chainId.");
  }

  const [lo, hi] = u256ToFelts(input.amount);
  const call: StarknetCall = {
    contractAddress: input.chain.usdc,
    entrypoint: "transfer",
    calldata: [recipient, lo, hi],
  };

  let hash: string;
  try {
    const { hashes } = await input.adapter.submitCalls([call]);
    const last = hashes[hashes.length - 1];
    if (!last) {
      return fail(
        steps,
        new Error("Starknet adapter returned no transaction hash."),
        "Starknet adapter returned no transaction hash.",
      );
    }
    hash = last;
  } catch (cause) {
    return fail(steps, cause, "Failed to submit Starknet USDC transfer.");
  }

  steps[1] = { name: "burn", state: "pending", txHash: hash };
  listeners?.onStep?.(steps[1]);

  try {
    const receipt = await input.adapter.confirmTransaction(hash);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        new Error(`Starknet transfer reverted (${hash}).`),
        "Starknet USDC transfer reverted.",
        "reverted_onchain",
      );
    }
  } catch (cause) {
    return fail(
      steps,
      cause,
      "Failed waiting for Starknet transfer confirmation.",
    );
  }

  steps[1] = { name: "burn", state: "success", txHash: hash };
  listeners?.onStep?.(steps[1]);
  return { kind: "success", finalTxHash: hash, steps };
}

function fail(
  steps: Step[],
  cause: unknown,
  fallbackMessage: string,
  category?: Parameters<typeof toWhiskError>[2],
): SendResult {
  const error: WhiskError = toWhiskError(cause, fallbackMessage, category);
  const idx = steps.findIndex((s) => s.name === "burn");
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
  return { kind: "failure", error, steps };
}
