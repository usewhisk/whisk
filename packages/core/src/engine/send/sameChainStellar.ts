/**
 * A G-account recipient needs a USDC trustline, or the SAC `transfer`
 * reverts with `TrustlineMissing`, which surfaces as a failure. Contract
 * recipients need none.
 */
import { Address, Contract, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import {
  canonicalToStellarSubunits,
  isValidStellarStrkey,
  type StellarChain,
  type StellarInvocation,
} from "@usewhisk/cctp";
import {
  InvalidAddressError,
  toWhiskError,
  WhiskError,
} from "../../errors/errors.js";
import type { Step } from "../../types/step.js";
import type { SendListeners, SendResult, StellarAdapter } from "../types.js";

export type ExecuteSameChainStellarSendInput = {
  chain: StellarChain;
  /** G, M or C strkey. */
  recipientAddress: string;
  /** 6-decimal subunits, scaled to Stellar's 7 on submit. */
  amount: bigint;
  adapter: StellarAdapter;
};

export async function executeSameChainStellarSend(
  input: ExecuteSameChainStellarSendInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  const steps: Step[] = [
    { name: "approve", state: "noop" },
    { name: "burn", state: "pending" },
    { name: "fetchAttestation", state: "noop" },
    { name: "mint", state: "noop" },
  ];
  listeners?.onStep?.(steps[0]!);

  if (!isValidStellarStrkey(input.recipientAddress)) {
    return fail(
      steps,
      new InvalidAddressError(input.recipientAddress),
      "Recipient is not a valid Stellar strkey.",
    );
  }

  try {
    const network = await input.adapter.getNetwork();
    if (network !== input.chain.stellarNetwork) {
      const err = toWhiskError(
        new Error(
          `Wallet is on ${network}; expected ${input.chain.stellarNetwork}.`,
        ),
        "Wrong Stellar network.",
      );
      return fail(steps, err, err.message);
    }
  } catch (cause) {
    return fail(steps, cause, "Failed to read Stellar network.");
  }

  const stellarAmount = canonicalToStellarSubunits(input.amount);
  const usdcSac = input.chain.usdc;
  const from = new Address(input.adapter.address).toScVal();
  const to = new Address(input.recipientAddress).toScVal();
  const amountScVal = nativeToScVal(stellarAmount, { type: "i128" });

  const args: xdr.ScVal[] = [from, to, amountScVal];
  const operation = new Contract(usdcSac).call("transfer", ...args);
  const invocation: StellarInvocation = {
    ecosystem: "stellar",
    contractId: usdcSac,
    functionName: "transfer",
    args,
    operation,
  };

  let signature: string;
  try {
    const result = await input.adapter.submitInvocation([invocation]);
    const last = result.hashes[result.hashes.length - 1];
    if (!last) {
      return fail(
        steps,
        new Error("Stellar adapter returned no tx hash."),
        "Stellar adapter returned no tx hash.",
      );
    }
    signature = last;
  } catch (cause) {
    return fail(steps, cause, "Failed to submit Stellar USDC transfer.");
  }

  steps[1] = { name: "burn", state: "pending", txHash: signature };
  listeners?.onStep?.(steps[1]);

  try {
    const receipt = await input.adapter.confirmTransaction(signature);
    if (receipt.status === "reverted") {
      return fail(
        steps,
        new Error(`Stellar transfer reverted (${signature}).`),
        "Stellar USDC transfer reverted.",
        "reverted_onchain",
      );
    }
  } catch (cause) {
    return fail(
      steps,
      cause,
      "Failed waiting for Stellar transfer confirmation.",
    );
  }

  steps[1] = { name: "burn", state: "success", txHash: signature };
  listeners?.onStep?.(steps[1]);
  return {
    kind: "success",
    finalTxHash: signature,
    steps,
  };
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
  return {
    kind: "failure",
    error,
    steps,
  };
}
