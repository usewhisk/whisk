/**
 * Stellar CCTP V2 `deposit_for_burn` invocation builder.
 *
 * Soroban contract entry points (from `circlefin/stellar-cctp`):
 *
 *   deposit_for_burn(
 *     caller: Address,
 *     amount: i128,                    // 7-decimal subunits (local USDC)
 *     destination_domain: u32,
 *     mint_recipient: BytesN<32>,
 *     burn_token: Address,             // USDC SAC contract
 *     destination_caller: BytesN<32>,
 *     max_fee: i128,                   // 7-decimal subunits
 *     min_finality_threshold: u32,
 *   )
 *
 *   deposit_for_burn_with_hook(
 *     ...same as above plus...
 *     hook_data: Bytes,
 *   )
 *
 * The contract internally normalizes 7-decimal local amounts to
 * 6-decimal canonical for the message. Dust below 0.0000001 USDC stays
 * on the user's Stellar balance.
 *
 * `amount` and `max_fee` here are expressed in Stellar's 7-decimal
 * subunits: multiply 6-decimal CCTP amounts by 10 before passing in.
 */
import {
  Address,
  Contract,
  nativeToScVal,
  Operation,
  xdr,
} from "@stellar/stellar-sdk";
import type { StellarChain } from "../chains/types.js";
import type { FinalityThreshold } from "../iris/types.js";
import { InvalidInputError } from "../errors.js";
import { decodeStrkeyToBytes32, isValidStellarStrkey } from "./strkey.js";

export type StellarInvocation = {
  ecosystem: "stellar";
  contractId: string;
  functionName: string;
  args: xdr.ScVal[];
  /** Pre-built XDR operation the adapter wraps in a Soroban transaction. */
  operation: xdr.Operation;
};

export type BuildStellarBurnIntentInput = {
  source: StellarChain;
  destinationDomain: number;
  /**
   * `mintRecipient` 32-byte payload as encoded into the CCTP message.
   * The caller is responsible for encoding it correctly:
   *   - EVM       20-byte address left-padded to 32 bytes
   *   - Solana    recipient USDC ATA pubkey (32 bytes raw)
   *   - Starknet  felt zero-padded to 32 bytes
   */
  mintRecipientBytes32: Uint8Array;
  /** Amount in 7-decimal Stellar USDC subunits. */
  amount: bigint;
  /** Max fee in 7-decimal Stellar USDC subunits. */
  maxFee: bigint;
  /**
   * `destinationCaller` 32-byte payload. For Stellar destinations this
   * MUST equal the `CctpForwarder` decoded to bytes32; for other
   * destinations this is typically 32 zero bytes (any caller).
   */
  destinationCallerBytes32: Uint8Array;
  /** Caller strkey (G or C). The wallet that authorizes the burn. */
  caller: string;
  /**
   * Optional hookData. When set, the builder targets
   * `deposit_for_burn_with_hook`; when unset, it targets the plain
   * `deposit_for_burn`.
   */
  hookData?: Uint8Array;
  /** 2000 on Stellar, which has no Fast Transfer. Take it from the fee tier. */
  minFinalityThreshold: FinalityThreshold;
};

export type StellarBurnIntent = {
  source: StellarChain;
  destinationDomain: number;
  amount: bigint;
  maxFee: bigint;
  invocation: StellarInvocation;
  withHook: boolean;
};

export function buildStellarBurnIntent(
  input: BuildStellarBurnIntentInput,
): StellarBurnIntent {
  if (input.source.ecosystem !== "stellar") {
    throw new InvalidInputError(
      "invalid_chain",
      `source must be a Stellar chain, got ${input.source.ecosystem}`,
    );
  }
  if (!isValidStellarStrkey(input.caller)) {
    throw new InvalidInputError(
      "invalid_address",
      `caller is not a valid Stellar strkey: ${input.caller}`,
    );
  }
  if (input.mintRecipientBytes32.length !== 32) {
    throw new InvalidInputError(
      "invalid_input",
      `mintRecipientBytes32 must be 32 bytes, got ${input.mintRecipientBytes32.length}`,
    );
  }
  if (input.destinationCallerBytes32.length !== 32) {
    throw new InvalidInputError(
      "invalid_input",
      `destinationCallerBytes32 must be 32 bytes, got ${input.destinationCallerBytes32.length}`,
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

  const withHook = !!input.hookData && input.hookData.length > 0;
  const fn = withHook ? "deposit_for_burn_with_hook" : "deposit_for_burn";

  const tmm = input.source.tokenMessengerMinter;
  const usdcSac = input.source.usdc;

  const args: xdr.ScVal[] = [
    new Address(input.caller).toScVal(),
    nativeToScVal(input.amount, { type: "i128" }),
    nativeToScVal(input.destinationDomain, { type: "u32" }),
    nativeToScVal(Buffer.from(input.mintRecipientBytes32), {
      type: "bytes",
    }),
    new Address(usdcSac).toScVal(),
    nativeToScVal(Buffer.from(input.destinationCallerBytes32), {
      type: "bytes",
    }),
    nativeToScVal(input.maxFee, { type: "i128" }),
    nativeToScVal(input.minFinalityThreshold, { type: "u32" }),
  ];

  if (withHook) {
    args.push(nativeToScVal(Buffer.from(input.hookData!), { type: "bytes" }));
  }

  const operation = new Contract(tmm).call(fn, ...args);

  return {
    source: input.source,
    destinationDomain: input.destinationDomain,
    amount: input.amount,
    maxFee: input.maxFee,
    invocation: {
      ecosystem: "stellar",
      contractId: tmm,
      functionName: fn,
      args,
      operation,
    },
    withHook,
  };
}

/** The 32-byte payload of a strkey, as CCTP message fields carry it. */
export function strkeyTo32Bytes(strkey: string): Uint8Array {
  return decodeStrkeyToBytes32(strkey);
}

// Keep `Operation` import referenced for the consumer side that builds
// transaction envelopes from the bare invocation.
void Operation;
