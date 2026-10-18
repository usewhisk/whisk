/**
 * Wallet adapter interface.
 *
 * The engine is signer-agnostic — it builds calldata / instructions
 * and hands them to an adapter to sign and submit. Each ecosystem has
 * its own adapter shape (EVM, Solana); the engine narrows by `kind`
 * before reaching for ecosystem-specific fields.
 *
 * Reference implementations:
 *   - EVM    `useEvmAdapter` in `@usewhisk/react` (wraps wagmi)
 *   - Solana `useSolanaAdapter` in `@usewhisk/react` (wraps Wallet Standard)
 */

import type {
  SolanaInstruction,
  StarknetCall,
  StellarInvocation,
} from "@usewhisk/cctp";

/* --------------------------------------------------------------------- *
 *  EVM
 * --------------------------------------------------------------------- */

export type EvmCall = {
  /** Target contract address. */
  to: `0x${string}`;
  /** ABI-encoded calldata. */
  data: `0x${string}`;
  /** Native value in wei. CCTP calls always pass `0n`. */
  value: bigint;
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
 * EVM wallet adapter. Implementations are responsible for:
 *   - Surfacing the connected account address.
 *   - Reading the live chainId (the wallet, not the dapp, is the source
 *     of truth).
 *   - Switching chains when the engine asks.
 *   - Submitting one or more EVM calls. Batching via EIP-5792 is a
 *     SHOULD, not a MUST — sequential single-tx submission is fine.
 *   - Waiting for receipts.
 *   - Translating wallet / RPC failures into Whisk's typed error
 *     hierarchy. The engine will not re-classify errors.
 */
export interface EvmAdapter {
  readonly kind: "evm";

  /** Currently connected account address. */
  readonly address: `0x${string}`;

  /**
   * Live chainId from the wallet. The engine calls this before each
   * write to confirm the wallet hasn't drifted off-chain.
   */
  getChainId(): Promise<number>;

  /**
   * Ensure the wallet is on `chainId`. Resolves when the wallet
   * confirms; rejects with `WrongChainError` if the user declines or
   * the chain isn't configured in the wallet.
   */
  switchChain(chainId: number): Promise<void>;

  /**
   * Submit one or more calls. Atomic batching via EIP-5792 is
   * preferred when available; otherwise calls are submitted
   * sequentially in array order and the implementation MUST wait for
   * each receipt before submitting the next.
   *
   * Rejection contract: throw a `WhiskError` subclass.
   */
  sendCalls(calls: EvmCall[]): Promise<SendCallsResult>;

  /**
   * Wait for a transaction receipt. Implementations decide the
   * timeout; the engine treats a timed-out wait as `NetworkError`.
   */
  waitForReceipt(hash: `0x${string}`): Promise<CallReceipt>;
}

/* --------------------------------------------------------------------- *
 *  Solana
 * --------------------------------------------------------------------- */

/**
 * Ephemeral signing material the engine hands to the adapter alongside
 * the connected wallet. CCTP burns require a fresh keypair for the
 * `message_sent_event_data` account; the engine generates it and the
 * adapter signs the transaction with both this keypair and the
 * connected wallet.
 *
 * Use a plain `{ publicKey, secretKey }` shape to avoid coupling to
 * any specific Solana keypair implementation; node-headless adapters
 * can supply `@solana/web3.js` `Keypair`s and react adapters can pass
 * Wallet Standard payloads.
 */
export type SolanaExtraSigner = {
  /** Base58-encoded pubkey. */
  publicKey: string;
  /** 64-byte ed25519 secret key. */
  secretKey: Uint8Array;
};

export type SolanaTransactionReceipt = {
  status: "success" | "reverted";
  /** Slot the transaction landed in. */
  slot: bigint;
};

/**
 * Solana wallet adapter. The engine builds the program instructions
 * via `@usewhisk/cctp`'s `buildSolanaBurnIntent` / `buildSolanaReceiveIntent`
 * and hands them off here.
 *
 * Unlike EVM, every Solana adapter call funnels into a single
 * `sendTransaction` — Solana's transaction model supports multiple
 * instructions per tx natively. CCTP burns need both the user signer
 * AND a fresh ephemeral keypair (for the `message_sent_event_data`
 * account); the engine provides the ephemeral keypair in
 * `extraSigners`.
 */
export interface SolanaAdapter {
  readonly kind: "solana";

  /** Currently connected account address — base58 pubkey. */
  readonly address: string;

  /** Live cluster (`mainnet-beta` or `devnet`). */
  getCluster(): Promise<"mainnet-beta" | "devnet">;

  /**
   * Sign and submit a transaction. The implementation is responsible
   * for fetching a recent blockhash, setting the connected wallet as
   * fee payer, partial-signing with each `extraSigners` entry, then
   * adding the user's signature.
   */
  sendTransaction(
    instructions: SolanaInstruction[],
    options?: { extraSigners?: SolanaExtraSigner[] },
  ): Promise<{ signature: string }>;

  /**
   * Wait for the transaction to land at the wallet's preferred
   * commitment (typically `confirmed`).
   */
  confirmTransaction(signature: string): Promise<SolanaTransactionReceipt>;

  /**
   * Read raw account data for a base58 pubkey. Returns `null` if the
   * account doesn't exist. The engine uses this for receive-side state
   * reads — most notably parsing the TokenMessenger's `fee_recipient`
   * field that `receive_message` requires as a remaining account.
   */
  getAccountInfo(pubkey: string): Promise<{ data: Uint8Array } | null>;
}

/* --------------------------------------------------------------------- *
 *  Stellar
 * --------------------------------------------------------------------- */

export type StellarTransactionReceipt = {
  status: "success" | "reverted";
  /** Soroban ledger sequence the transaction landed in. */
  ledger: number;
};

/**
 * Stellar wallet adapter. The engine builds Soroban contract
 * invocations via `@usewhisk/cctp`'s `buildStellarBurnIntent` /
 * `buildStellarMintIntent` (and the same-chain USDC SAC transfer
 * helper), then hands the bare invocation to the adapter. The adapter
 * is responsible for:
 *   - Picking the right Stellar RPC for the network
 *   - Assembling the operation into a `TransactionBuilder` envelope
 *   - Simulating to get the resource footprint + fees
 *   - Signing with the connected wallet
 *   - Submitting via `sendTransaction`
 *   - Polling `getTransaction` until SUCCESS / FAILED
 *
 * Errors should be converted to `WhiskError` via `toWhiskError` so the
 * engine surfaces typed categories.
 */
export interface StellarAdapter {
  readonly kind: "stellar";

  /** Connected wallet address — typically a G… Ed25519 pubkey. */
  readonly address: string;

  /** Live Stellar network the wallet is on (`public` or `testnet`). */
  getNetwork(): Promise<"public" | "testnet">;

  /**
   * Submit one or more Soroban contract invocations. Each invocation
   * lands as its own Soroban transaction (Soroban allows one
   * InvokeHostFunctionOp per tx). The adapter MUST wait for each
   * transaction to land before submitting the next so allowance and
   * state ordering is preserved (e.g. `approve` → `deposit_for_burn`).
   *
   * Returns hashes in submission order; the engine treats the LAST
   * entry as the "primary" transaction for downstream effects (Iris
   * attestation polling, receipt display).
   */
  submitInvocation(
    invocations: StellarInvocation[],
  ): Promise<{ hashes: string[] }>;

  /** Wait until the transaction lands or fails. */
  confirmTransaction(hash: string): Promise<StellarTransactionReceipt>;

  /**
   * Current Soroban ledger sequence. The engine uses this to compute
   * `expiration_ledger` for USDC SAC `approve` calls — Stellar's SAC
   * requires `live_until_ledger >= current ledger`, so a static `0`
   * fails. Set short windows (~360 ledgers / 30 min on testnet) to
   * keep allowances tight.
   */
  getLatestLedger(): Promise<number>;
}

/* --------------------------------------------------------------------- *
 *  Starknet
 * --------------------------------------------------------------------- */

export type StarknetTransactionReceipt = {
  status: "success" | "reverted";
  /** Block number the transaction landed in. */
  blockNumber: number;
};

/**
 * Starknet wallet adapter. Cairo calls funnel through this adapter as
 * `{ contractAddress, entrypoint, calldata }` `StarknetCall` records.
 * The adapter is responsible for:
 *   - Surfacing the connected account address (felt252 hex)
 *   - Reading the live chainId felt (the wallet, not the dapp, is the
 *     source of truth)
 *   - Submitting one or more Cairo calls — atomic multicall is the
 *     preferred mode (Starknet accounts natively support it), but
 *     sequential single-call submission also works
 *   - Waiting for receipts
 *   - Translating wallet / RPC failures into Whisk's typed error
 *     hierarchy
 */
export interface StarknetAdapter {
  readonly kind: "starknet";

  /** Connected account address — felt252 hex. */
  readonly address: string;

  /**
   * Live chainId felt from the wallet. Whisk's engine compares against
   * the configured chain before each write.
   */
  getChainId(): Promise<string>;

  /**
   * Submit one or more Cairo calls. Atomic multicall is preferred —
   * Starknet accounts can authorize and execute multiple calls in a
   * single transaction.
   *
   * Returns the submitted tx hash(es) in submission order; the engine
   * treats the LAST entry as the primary transaction.
   */
  submitCalls(calls: StarknetCall[]): Promise<{ hashes: string[] }>;

  /** Wait until the transaction lands or fails. */
  confirmTransaction(hash: string): Promise<StarknetTransactionReceipt>;
}

/* --------------------------------------------------------------------- *
 *  Public adapter union
 * --------------------------------------------------------------------- */

/**
 * v1 ships `EvmAdapter`, `SolanaAdapter`, `StellarAdapter`, and
 * `StarknetAdapter`. Discriminate on `kind` before reaching for
 * ecosystem-specific fields.
 */
export type WhiskAdapter =
  | EvmAdapter
  | SolanaAdapter
  | StellarAdapter
  | StarknetAdapter;
