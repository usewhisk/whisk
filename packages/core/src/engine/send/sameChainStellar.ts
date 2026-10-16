/**
 * Same-chain USDC transfer on Stellar.
 *
 * Sender and recipient are on the same Stellar network — no CCTP, just
 * a single `transfer(from, to, amount)` invocation on the USDC Stellar
 * Asset Contract (SAC). Amounts are in 7-decimal Stellar USDC subunits;
 * the caller's `parseUsdcAmount` returns 6-decimal so we scale by 10.
 *
 * The recipient must already have a USDC trustline (account-funded) OR
 * be a contract — `transfer` on the SAC will revert with `TrustlineMissing`
 * if a G-account recipient hasn't established the trustline. The engine
 * surfaces this as a clean failure rather than papering over it.
 */
import { Address, Contract, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import {
  canonicalToStellarSubunits,
  isValidStellarStrkey,
  type StellarCctpChain,
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
  chain: StellarCctpChain;
  /** Recipient strkey (G…, M…, or C…). */
  recipientAddress: string;
  /** Amount in 6-decimal canonical subunits. Scaled to 7 decimals on submit. */
  amount: bigint;
  adapter: StellarAdapter;
};

export async function executeSameChainStellarSend(
  input: ExecuteSameChainStellarSendInput,
  listeners?: SendListeners,
): Promise<SendResult> {
  const steps: Step[] = [
    { name: "approve", state: "noop" }, // Stellar transfers don't need approval
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
