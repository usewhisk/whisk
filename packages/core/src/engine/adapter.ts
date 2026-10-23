/**
 * The engine builds calls and hands them to an adapter to sign and submit.
 * Each ecosystem has its own adapter shape, narrowed by `kind`. The React
 * package ships reference implementations, such as `useEvmAdapter` (wagmi)
 * and `useSolanaAdapter` (Wallet Standard).
 */

import type {
  SolanaInstruction,
  StarknetCall,
  StellarInvocation,
} from "@usewhisk/cctp";

export type EvmCall = {
  to: `0x${string}`;
  data: `0x${string}`;
  /** Native value in wei. CCTP calls always pass `0n`. */
  value: bigint;
  /**
   * Set by the engine where the chain needs it, as on Arc, which drops a
   * transaction offering less than its 20 gwei base fee floor. Adapters pass
   * both through when set and otherwise let the wallet choose.
   */
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
};

export type SendCallsOptions = {
  /**
   * Called with each hash as soon as the wallet returns it, before any
   * receipt wait. `index` is the call it covers; a batch that shares one
   * hash reports it once, for the last call.
   */
  onSubmitted?: (hash: `0x${string}`, index: number) => void;
};

export type SendCallsResult = {
  /**
   * Submitted transaction hashes, in submission order. With EIP-5792
   * `wallet_sendCalls` an entire batch may share a single hash; in that
   * case the array has length 1 and every step in the engine references
   * the same hash.
   */
  hashes: `0x${string}`[];
};

export type CallReceipt = {
  status: "success" | "reverted";
  blockNumber: bigint;
};

/**
 * Batching through EIP-5792 is optional; sequential submission is fine.
 * Implementations translate wallet and RPC failures into Whisk's typed
 * errors, since the engine does not re-classify them.
 */
export interface EvmAdapter {
  readonly kind: "evm";

  readonly address: `0x${string}`;

  /**
   * Read from the wallet, which is the source of truth. The engine checks
   * it before each write in case the wallet switched chains.
   */
  getChainId(): Promise<number>;

  /**
   * Rejects with `WrongChainError` if the user declines or the chain isn't
   * configured in the wallet.
   */
  switchChain(chainId: number): Promise<void>;

  /**
   * Atomic batching through EIP-5792 is preferred. Without it, calls go in
   * array order and each receipt must land before the next is submitted.
   * Throws a `WhiskError` subclass.
   */
  sendCalls(
    calls: EvmCall[],
    options?: SendCallsOptions,
  ): Promise<SendCallsResult>;

  /**
   * Implementations decide the timeout; the engine treats a timed-out wait
   * as `NetworkError`.
   */
  waitForReceipt(hash: `0x${string}`): Promise<CallReceipt>;
}

/**
 * A CCTP burn on Solana needs a fresh keypair for the
 * `message_sent_event_data` account. The engine generates it and the adapter
 * signs with it alongside the connected wallet. The plain shape avoids
 * coupling to any one Solana keypair type.
 */
export type SolanaExtraSigner = {
  /** Base58. */
  publicKey: string;
  /** 64-byte ed25519 secret key. */
  secretKey: Uint8Array;
};

export type SolanaTransactionReceipt = {
  status: "success" | "reverted";
  slot: bigint;
};

export interface SolanaAdapter {
  readonly kind: "solana";

  /** Base58 pubkey. */
  readonly address: string;

  getCluster(): Promise<"mainnet-beta" | "devnet">;

  /**
   * The implementation fetches a recent blockhash, sets the connected wallet
   * as fee payer, partial-signs with each `extraSigners` entry, then adds
   * the user's signature.
   */
  sendTransaction(
    instructions: SolanaInstruction[],
    options?: { extraSigners?: SolanaExtraSigner[] },
  ): Promise<{ signature: string }>;

  /** Waits at the wallet's preferred commitment, usually `confirmed`. */
  confirmTransaction(signature: string): Promise<SolanaTransactionReceipt>;

  /**
   * Returns `null` if the account doesn't exist. The engine reads the
   * TokenMessenger's `fee_recipient` through this, since `receive_message`
   * needs it as a remaining account.
   */
  getAccountInfo(pubkey: string): Promise<{ data: Uint8Array } | null>;
}

export type StellarTransactionReceipt = {
  status: "success" | "reverted";
  ledger: number;
};

export type StellarTrustline = {
  /** Stroops, 7 decimals. */
  balance: bigint;
  limit: bigint;
  /** The issuer's AUTHORIZED flag. Without it the account cannot receive. */
  authorized: boolean;
};

/**
 * The engine hands over bare Soroban invocations. The adapter picks the RPC,
 * builds the envelope, simulates for the footprint and fees, signs, submits
 * and polls `getTransaction` until it succeeds or fails. Errors go through
 * `toWhiskError` so the engine sees typed categories.
 */
export interface StellarAdapter {
  readonly kind: "stellar";

  /** Usually a G... strkey. */
  readonly address: string;

  getNetwork(): Promise<"public" | "testnet">;

  /**
   * Soroban allows one InvokeHostFunctionOp per transaction, so each
   * invocation lands on its own. Each must land before the next is
   * submitted, so an `approve` is in place before the `deposit_for_burn`
   * that spends it. The engine treats the last hash as the primary one.
   */
  submitInvocation(
    invocations: StellarInvocation[],
  ): Promise<{ hashes: string[] }>;

  confirmTransaction(hash: string): Promise<StellarTransactionReceipt>;

  /**
   * The engine sets USDC `approve` expiry from this. The SAC requires
   * `live_until_ledger >= current ledger`, so a static `0` fails.
   */
  getLatestLedger(): Promise<number>;

  /**
   * The account's trustline for `asset`, or `null` when it has none. Before a
   * burn into Stellar the engine reads the recipient's USDC trustline through
   * this, and refuses to bridge to a classic account when it is missing.
   */
  getTrustline?(
    account: string,
    asset: { code: string; issuer: string },
  ): Promise<StellarTrustline | null>;
}

export type StarknetTransactionReceipt = {
  status: "success" | "reverted";
  blockNumber: number;
};

/**
 * Atomic multicall is preferred, since Starknet accounts support it
 * natively, but sequential submission also works. Implementations translate
 * wallet and RPC failures into Whisk's typed errors.
 */
export interface StarknetAdapter {
  readonly kind: "starknet";

  /** felt252 hex. */
  readonly address: string;

  /** Read from the wallet; the engine checks it before each write. */
  getChainId(): Promise<string>;

  /** The engine treats the last hash as the primary transaction. */
  submitCalls(calls: StarknetCall[]): Promise<{ hashes: string[] }>;

  confirmTransaction(hash: string): Promise<StarknetTransactionReceipt>;
}

/** Discriminate on `kind` before reaching for ecosystem-specific fields. */
export type WhiskAdapter =
  | EvmAdapter
  | SolanaAdapter
  | StellarAdapter
  | StarknetAdapter;
