/**
 * Burn intent builder.
 *
 * Produces ready-to-sign calldata for a CCTP V2 bridge. The engine
 * hands the resulting `BurnIntent.calls` array to its wallet adapter
 * one by one (or batched via EIP-5792 when the wallet supports it).
 *
 * The burn's finality threshold is the fee tier's: 1000 for Fast,
 * 2000 for Standard. A Fast tier on a chain without Fast is refused.
 *
 * Forwarder is on by default — the burn call uses
 * `depositForBurnWithHook` with the canonical `cctp-forward` magic
 * bytes so Circle's Orbit relayer handles the destination mint. To
 * skip the forwarder set `withForwarder: false`; the user will then
 * need to call `receiveMessage` manually on the destination chain.
 */
import { encodeFunctionData, type Address as ViemAddress } from "viem";
import { PublicKey } from "@solana/web3.js";
import type { Address, CctpChain } from "../chains/types.js";
import {
  ANY_DESTINATION_CALLER,
  CCTP_FORWARD_HOOK_DATA,
} from "../forwarder/hookData.js";
import { tokenMessengerV2Abi } from "../abi/tokenMessengerV2.js";
import { usdcAbi } from "../abi/usdc.js";
import { toBytes32, isAddress } from "../encoding/address.js";
import { FINALITY_FAST } from "../iris/types.js";
import { computeMaxFee, type ComputeMaxFeeInput } from "../fees/math.js";
import {
  InvalidInputError,
  ProtocolError,
  UnsupportedError,
} from "../errors.js";
import type { BurnIntent, EvmCall } from "./types.js";

export type BuildBurnIntentInput = {
  source: CctpChain;
  destination: CctpChain;
  /** USDC subunits (6 decimals). Must be > 0 and ≤ 10M USDC. */
  amount: bigint;
  /** Recipient on the destination chain as a 20-byte EVM address. */
  mintRecipient: Address | string;
  /**
   * Restrict who can call `receiveMessage` on the destination. Defaults
   * to `bytes32(0)` (any caller) so the forwarder can mint without
   * extra coordination. Pass a specific 32-byte value if you need to
   * lock the mint down.
   */
  destinationCaller?: `0x${string}`;
  /**
   * Approve allowance to set on USDC. Defaults to `amount`. Set higher
   * to skip the approve call across multiple bridges (allowance
   * caching).
   */
  approveAmount?: bigint;
  /**
   * If `true`, skip the approve call entirely (the wallet already has
   * sufficient allowance). Defaults to `false`.
   */
  skipApprove?: boolean;
  /**
   * Trigger Circle's Orbit forwarder by including the
   * `cctp-forward` hookData. Defaults to `true`. Set to `false` to
   * make the user mint manually on the destination chain.
   */
  withForwarder?: boolean;
  /**
   * Override the hookData. When `withForwarder` is true and this is
   * unset, the EVM-side `cctp-forward` magic bytes are used (Circle's
   * Orbit relayer). For Stellar destinations, pass the Stellar
   * `CctpForwarder` hookData instead — the EVM relayer is irrelevant
   * because the Stellar Forwarder is what reads this field on chain.
   */
  customHookData?: `0x${string}`;
  /** Forwarder fee math inputs. See `computeMaxFee` for details. */
  fee: Pick<
    ComputeMaxFeeInput,
    "tier" | "forwarderLevel" | "forwarderBufferBps"
  > & {
    /**
     * Burn with exactly this cap instead of one computed from the tier. Pass
     * the `maxFee` the payer confirmed.
     */
    maxFee?: bigint;
  };
};

/** Hard cap from CCTP — single burn cannot exceed $10M USDC. */
const MAX_USDC_AMOUNT = 10_000_000n * 1_000_000n; // 10M × 1e6 subunits

/**
 * Build the calldata for a CCTP V2 bridge.
 */
export function buildBurnIntent(input: BuildBurnIntentInput): BurnIntent {
  // ---- validation ----------------------------------------------------------
  // `buildBurnIntent` produces EVM calldata — source MUST be EVM.
  // Destination ecosystem is free; the only thing the burn cares about
  // is the destination domain and the bytes32 mintRecipient encoding.
  if (input.source.ecosystem !== "evm") {
    throw new UnsupportedError(
      "unsupported_ecosystem",
      `Source chain "${input.source.id}" is not EVM. Use the Solana burn builder for Solana sources.`,
    );
  }
  if (input.source.cctpDomain === input.destination.cctpDomain) {
    throw new InvalidInputError(
      "no_route",
      `Source and destination domains are identical (${input.source.cctpDomain}). Use a same-chain transfer instead of bridge.`,
    );
  }
  if (input.amount <= 0n) {
    throw new InvalidInputError(
      "invalid_amount",
      `amount must be positive, got ${input.amount}`,
    );
  }
  if (input.amount > MAX_USDC_AMOUNT) {
    throw new ProtocolError(
      "amount_too_large",
      `amount exceeds CCTP per-burn cap of 10,000,000 USDC (got ${input.amount} subunits)`,
    );
  }
  // mintRecipient validation depends on the destination ecosystem.
  //   EVM     → 20-byte 0x-prefixed hex
  //   Solana  → base58 32-byte pubkey
  //   Stellar → 0x-prefixed 32-byte hex (caller pre-encodes the
  //             CctpForwarder strkey via `contractStrkeyToBytes32Hex`)
  if (input.destination.ecosystem === "solana") {
    try {
      new PublicKey(input.mintRecipient);
    } catch {
      throw new InvalidInputError(
        "invalid_address",
        `mintRecipient is not a valid Solana pubkey: ${input.mintRecipient}`,
      );
    }
  } else if (input.destination.ecosystem === "stellar") {
    if (!/^0x[a-fA-F0-9]{64}$/.test(input.mintRecipient)) {
      throw new InvalidInputError(
        "invalid_address",
        `mintRecipient for Stellar must be 0x-prefixed 32-byte hex (the CctpForwarder strkey decoded); got: ${input.mintRecipient}`,
      );
    }
  } else if (input.destination.ecosystem === "starknet") {
    // Starknet felt zero-padded to 32 bytes.
    if (!/^0x[a-fA-F0-9]{64}$/.test(input.mintRecipient)) {
      throw new InvalidInputError(
        "invalid_address",
        `mintRecipient for Starknet must be 0x-prefixed 32-byte hex; got: ${input.mintRecipient}`,
      );
    }
  } else if (!isAddress(input.mintRecipient)) {
    throw new InvalidInputError(
      "invalid_address",
      `mintRecipient is not a valid EVM address: ${input.mintRecipient}`,
    );
  }
  const finalityThreshold = input.fee.tier.finalityThreshold;
  if (
    finalityThreshold === FINALITY_FAST &&
    !input.source.capabilities.fastSource
  ) {
    throw new ProtocolError(
      "no_route",
      `Source chain "${input.source.id}" has no Fast Transfer. Use its Standard fee tier.`,
    );
  }

  const withForwarder = input.withForwarder ?? true;
  const destinationCaller = input.destinationCaller ?? ANY_DESTINATION_CALLER;

  // ---- fee math ------------------------------------------------------------
  const computed = computeMaxFee({
    amount: input.amount,
    tier: input.fee.tier,
    ...(input.fee.forwarderLevel !== undefined && {
      forwarderLevel: input.fee.forwarderLevel,
    }),
    ...(input.fee.forwarderBufferBps !== undefined && {
      forwarderBufferBps: input.fee.forwarderBufferBps,
    }),
    includeForwarder: withForwarder,
  });
  const { burnFee, forwarderFee } = computed;
  const maxFee = input.fee.maxFee ?? computed.maxFee;
  if (maxFee < 0n || maxFee >= input.amount) {
    throw new InvalidInputError(
      "invalid_amount",
      `maxFee must be at least 0 and below amount (TokenMessengerV2 reverts otherwise), got ${maxFee}`,
    );
  }

  // ---- encode --------------------------------------------------------------
  const mintRecipientBytes32: `0x${string}` =
    input.destination.ecosystem === "solana"
      ? solanaPubkeyToBytes32Hex(input.mintRecipient)
      : input.destination.ecosystem === "stellar" ||
          input.destination.ecosystem === "starknet"
        ? (input.mintRecipient as `0x${string}`)
        : toBytes32(input.mintRecipient);
  const calls: EvmCall[] = [];

  if (!input.skipApprove) {
    const approveAmount = input.approveAmount ?? input.amount;
    if (approveAmount < input.amount) {
      throw new InvalidInputError(
        "invalid_amount",
        `approveAmount (${approveAmount}) must be ≥ amount (${input.amount})`,
      );
    }
    calls.push({
      to: input.source.usdc,
      data: encodeFunctionData({
        abi: usdcAbi,
        functionName: "approve",
        args: [input.source.tokenMessenger as ViemAddress, approveAmount],
      }),
      value: 0n,
    });
  }

  const burnArgs = [
    input.amount,
    input.destination.cctpDomain,
    mintRecipientBytes32,
    input.source.usdc as ViemAddress,
    destinationCaller,
    maxFee,
    finalityThreshold,
  ] as const;

  const effectiveHookData: `0x${string}` =
    input.customHookData ?? CCTP_FORWARD_HOOK_DATA;
  const callWithHook = withForwarder || input.customHookData !== undefined;
  calls.push({
    to: input.source.tokenMessenger,
    data: callWithHook
      ? encodeFunctionData({
          abi: tokenMessengerV2Abi,
          functionName: "depositForBurnWithHook",
          args: [...burnArgs, effectiveHookData],
        })
      : encodeFunctionData({
          abi: tokenMessengerV2Abi,
          functionName: "depositForBurn",
          args: burnArgs,
        }),
    value: 0n,
  });

  return {
    source: input.source,
    destination: input.destination,
    calls,
    amount: input.amount,
    maxFee,
    burnFee,
    forwarderFee,
    mintRecipientBytes32,
    withForwarder,
    finalityThreshold,
  };
}

function solanaPubkeyToBytes32Hex(address: string): `0x${string}` {
  const bytes = new PublicKey(address).toBytes();
  let s = "0x";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s as `0x${string}`;
}
