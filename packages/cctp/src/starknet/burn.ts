/**
 * Starknet CCTP V2 `deposit_for_burn` / `deposit_for_burn_with_hook`
 * Call builder.
 *
 * Cairo signatures (from `circlefin/starknet-cctp`):
 *
 *   fn deposit_for_burn(
 *     amount: u256,
 *     destination_domain: u32,
 *     mint_recipient: u256,
 *     burn_token: ContractAddress,
 *     destination_caller: u256,
 *     max_fee: u256,
 *     min_finality_threshold: u32,
 *   )
 *
 *   fn deposit_for_burn_with_hook(
 *     ...same...
 *     hook_data: ByteArray,
 *   )
 *
 * USDC on Starknet behaves like ERC-20 — burn pulls funds via
 * `transferFrom`, so the caller must `approve(TMM, amount)` first. The
 * engine handles that approve invocation; this builder only produces
 * the burn Call.
 */
import type { StarknetCctpChain, StarknetFelt } from "../chains/types.js";
import { FINALITY_FAST } from "../iris/types.js";
import { InvalidInputError } from "../errors.js";
import {
  bytesToByteArrayFelts,
  feltToString,
  u256ToFelts,
} from "./calldata.js";
import { assertStarknetFelt } from "./address.js";

export type StarknetCall = {
  /** Contract being called — felt-formatted address. */
  contractAddress: StarknetFelt;
  /** Cairo function name (snake_case). */
  entrypoint: string;
  /** Pre-serialized calldata as a flat felt array (decimal strings). */
  calldata: string[];
};

export type BuildStarknetBurnIntentInput = {
  source: StarknetCctpChain;
  destinationDomain: number;
  /** USDC subunits (6 decimals) — the canonical CCTP amount. */
  amount: bigint;
  /** `maxFee` cap in 6-decimal subunits. */
  maxFee: bigint;
  /**
   * 32-byte mintRecipient — Starknet packs into a single u256 felt. The
   * caller is responsible for encoding correctly:
   *   - EVM     20-byte address left-padded to 32 bytes
   *   - Solana  recipient USDC ATA pubkey (32 bytes raw)
   *   - Stellar CctpForwarder strkey decoded to 32 bytes
   *   - Starknet contract felt
   */
  mintRecipient: bigint;
  /** `destinationCaller` u256. Zero = any caller. */
  destinationCaller: bigint;
  /** Optional hookData; when set, builds `deposit_for_burn_with_hook`. */
  hookData?: Uint8Array;
  /** Finality threshold — defaults to Fast Transfer (1000). */
  minFinalityThreshold?: number;
};

export type StarknetBurnIntent = {
  source: StarknetCctpChain;
  destinationDomain: number;
  amount: bigint;
  maxFee: bigint;
  call: StarknetCall;
  withHook: boolean;
};

export function buildStarknetBurnIntent(
  input: BuildStarknetBurnIntentInput,
): StarknetBurnIntent {
  if (input.source.ecosystem !== "starknet") {
    throw new InvalidInputError(
      "invalid_chain",
      `source must be Starknet, got ${input.source.ecosystem}`,
    );
  }
  if (input.amount <= 0n) {
    throw new InvalidInputError(
      "invalid_amount",
      `amount must be positive, got ${input.amount}`,
    );
  }
  if (input.maxFee < 0n) {
    throw new InvalidInputError(
      "invalid_amount",
      `maxFee must be non-negative, got ${input.maxFee}`,
    );
  }
  if (input.mintRecipient < 0n) {
    throw new InvalidInputError(
      "invalid_input",
      `mintRecipient must be non-negative, got ${input.mintRecipient}`,
    );
  }

  const withHook = !!input.hookData && input.hookData.length > 0;
  const entrypoint = withHook
    ? "deposit_for_burn_with_hook"
    : "deposit_for_burn";
  const minFinality = input.minFinalityThreshold ?? FINALITY_FAST;

  const [amountLo, amountHi] = u256ToFelts(input.amount);
  const [recipLo, recipHi] = u256ToFelts(input.mintRecipient);
  const [callerLo, callerHi] = u256ToFelts(input.destinationCaller);
  const [maxFeeLo, maxFeeHi] = u256ToFelts(input.maxFee);

  const calldata: string[] = [
    amountLo,
    amountHi,
    feltToString(input.destinationDomain),
    recipLo,
    recipHi,
    assertStarknetFelt(input.source.usdc),
    callerLo,
    callerHi,
    maxFeeLo,
    maxFeeHi,
    feltToString(minFinality),
  ];

  if (withHook) {
    calldata.push(...bytesToByteArrayFelts(input.hookData!));
  }

  return {
    source: input.source,
    destinationDomain: input.destinationDomain,
    amount: input.amount,
    maxFee: input.maxFee,
    call: {
      contractAddress: input.source.tokenMessengerMinter,
      entrypoint,
      calldata,
    },
    withHook,
  };
}

/**
 * Build the USDC SAC `approve` Call. Starknet's USDC follows the
 * standard ERC-20 / SNIP-2 interface: `approve(spender, amount: u256)`.
 */
export function buildStarknetApproveCall(args: {
  source: StarknetCctpChain;
  spender: StarknetFelt;
  amount: bigint;
}): StarknetCall {
  if (args.source.ecosystem !== "starknet") {
    throw new InvalidInputError(
      "invalid_chain",
      `source must be Starknet, got ${args.source.ecosystem}`,
    );
  }
  if (args.amount <= 0n) {
    throw new InvalidInputError(
      "invalid_amount",
      `amount must be positive, got ${args.amount}`,
    );
  }
  const [lo, hi] = u256ToFelts(args.amount);
  return {
    contractAddress: args.source.usdc,
    entrypoint: "approve",
    calldata: [assertStarknetFelt(args.spender), lo, hi],
  };
}
