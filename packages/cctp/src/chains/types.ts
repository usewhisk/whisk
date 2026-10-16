/**
 * Chain registry shape.
 *
 * One row per chain. The registry is the single source of truth for
 * addresses, domain IDs, contracts, RPC URLs, and explorer links.
 * Discriminated by `ecosystem` — EVM and Solana share the surface but
 * carry different field shapes (hex addresses vs base58 pubkeys,
 * `evmChainId` vs `cluster`).
 */

export type CctpNetwork = "mainnet" | "testnet";

export type CctpEcosystem = "evm" | "solana" | "stellar" | "starknet";

/**
 * Domain IDs are assigned by Circle. They identify a chain inside CCTP
 * messages independent of `evmChainId` / `cluster`. Stable across forks
 * of the same logical chain (e.g. testnet variants share a domain with
 * their mainnet counterpart when Circle treats them as the same domain).
 */
export type CctpDomain = number;

/**
 * EVM chain id (`viem`'s `chain.id`). Used for RPC selection and
 * wallet `chainId` validation.
 */
export type EvmChainId = number;

/**
 * EVM hex addresses, 0x-prefixed.
 */
export type Address = `0x${string}`;

/**
 * Solana program / mint / account identifier, base58-encoded.
 */
export type SolanaPubkey = string;

/**
 * Solana cluster — distinguishes mainnet-beta from devnet at the RPC
 * level. Mirrors what `@solana/web3.js`'s `clusterApiUrl` accepts.
 */
export type SolanaCluster = "mainnet-beta" | "devnet";

/**
 * Stellar strkey-encoded address. Variants are distinguished by the
 * leading character: `G` = Ed25519 account (user wallets), `M` = muxed
 * account (G + numeric ID), `C` = Soroban contract. CCTP messages strip
 * the type marker and carry only the 32-byte payload, so `mintRecipient`
 * is always assumed to be a contract — Whisk routes Stellar mints
 * through `CctpForwarder` to address the right kind of account.
 */
export type StellarStrkey = string;

/**
 * Stellar network identifier — `public` = mainnet, `testnet` = the SDF
 * testnet. Picks the right RPC and network passphrase.
 */
export type StellarNetwork = "public" | "testnet";

/**
 * Starknet network identifier — `mainnet` (SN_MAIN) or `sepolia`
 * (SN_SEPOLIA). Selects the right RPC and chain ID for signing.
 */
export type StarknetNetwork = "mainnet" | "sepolia";

/**
 * Starknet address — `0x`-prefixed felt252 hex. Variable-length up to
 * 64 hex chars after the prefix. The CCTP layer always normalizes to
 * the 32-byte representation when crossing the wire.
 */
export type StarknetFelt = `0x${string}`;

/**
 * Discriminated union — branch on `ecosystem` to access ecosystem-
 * specific fields. Shared metadata (name, label, network, cctpDomain,
 * RPCs, explorer, Fast Transfer support) lives on every branch.
 */
export type CctpChain =
  | EvmCctpChain
  | SolanaCctpChain
  | StellarCctpChain
  | StarknetCctpChain;

export interface EvmCctpChain {
  ecosystem: "evm";
  /** Canonical name. Used as the registry key. Stable across versions. */
  name: string;
  /** Human-readable label for UI. */
  label: string;
  network: CctpNetwork;
  evmChainId: EvmChainId;
  cctpDomain: CctpDomain;
  /** USDC contract on this chain. */
  usdc: Address;
  /** `TokenMessengerV2` contract on this chain. */
  tokenMessenger: Address;
  /** `MessageTransmitterV2` contract on this chain. */
  messageTransmitter: Address;
  /**
   * Public RPC endpoints. The first one is the default; engine can
   * fall back to later entries. Always overridable via config.
   */
  defaultRpcUrls: readonly string[];
  /** Block explorer URL prefix. Used by `explorerTxUrl()`. */
  explorerUrl: string;
  /**
   * Whether this chain supports Fast Transfer as a source. Some chains
   * (Polygon, Avalanche, Sei, etc.) are Standard-only on CCTP V2 and
   * Whisk refuses to bridge from them — see ROADMAP.md.
   */
  supportsFastTransfer: boolean;
}

export interface SolanaCctpChain {
  ecosystem: "solana";
  name: string;
  label: string;
  network: CctpNetwork;
  /** Solana cluster identifier (mainnet-beta or devnet). */
  cluster: SolanaCluster;
  cctpDomain: CctpDomain;
  /** USDC SPL mint pubkey on this cluster. */
  usdc: SolanaPubkey;
  /**
   * `TokenMessengerMinterV2` program ID. CCTP V2 on Solana merges the
   * TokenMessenger + TokenMinter into a single Anchor program, hence
   * the combined name.
   */
  tokenMessengerMinter: SolanaPubkey;
  /** `MessageTransmitterV2` program ID. */
  messageTransmitter: SolanaPubkey;
  defaultRpcUrls: readonly string[];
  explorerUrl: string;
  /** Always `true` for Solana — the program supports Fast Transfer. */
  supportsFastTransfer: boolean;
}

export interface StellarCctpChain {
  ecosystem: "stellar";
  name: string;
  label: string;
  network: CctpNetwork;
  /** Stellar network identifier — `public` (mainnet) or `testnet`. */
  stellarNetwork: StellarNetwork;
  /** Stellar network passphrase — required for Soroban transaction signing. */
  networkPassphrase: string;
  cctpDomain: CctpDomain;
  /**
   * USDC asset issuer (G…). The Stellar Asset Contract (SAC) for USDC
   * is derived from the asset code + issuer + network passphrase at
   * runtime via `@stellar/stellar-sdk`'s `Asset.contractId()`. Keeping
   * the issuer here lets the engine compute the SAC without hardcoding.
   */
  usdcIssuer: StellarStrkey;
  /** Pre-computed USDC SAC contract ID (C…). Optional cache field. */
  usdc: StellarStrkey;
  /**
   * `TokenMessengerMinter` Soroban contract on this Stellar network.
   * Stellar's CCTP V2 merges TokenMessenger + TokenMinter into a single
   * Soroban contract, like Solana's `TokenMessengerMinterV2`.
   */
  tokenMessengerMinter: StellarStrkey;
  /** `MessageTransmitter` Soroban contract on this Stellar network. */
  messageTransmitter: StellarStrkey;
  /**
   * `CctpForwarder` Soroban contract — mandatory hop for any CCTP
   * inbound to Stellar. Both `mintRecipient` AND `destinationCaller`
   * MUST be set to this address on the burn side; the actual recipient
   * (G/M/C strkey) is encoded into hookData. Putting the user pubkey
   * as `mintRecipient` causes permanent loss of funds.
   */
  cctpForwarder: StellarStrkey;
  defaultRpcUrls: readonly string[];
  explorerUrl: string;
  /** Always `true` for Stellar — Circle ships Fast Transfer for Stellar. */
  supportsFastTransfer: boolean;
}

export interface StarknetCctpChain {
  ecosystem: "starknet";
  name: string;
  label: string;
  network: CctpNetwork;
  /** Starknet network — `mainnet` or `sepolia`. */
  starknetNetwork: StarknetNetwork;
  /**
   * Starknet chain ID — encoded as a shortstring felt (e.g.
   * `0x534e5f5345504f4c4941` for `SN_SEPOLIA`). Wallets validate
   * against this when signing.
   */
  chainId: StarknetFelt;
  cctpDomain: CctpDomain;
  /** USDC ERC-20-compatible contract on Starknet. */
  usdc: StarknetFelt;
  /**
   * `TokenMessengerMinterV2` Cairo contract. Merges TokenMessenger +
   * TokenMinter like Solana / Stellar.
   */
  tokenMessengerMinter: StarknetFelt;
  /** `MessageTransmitterV2` Cairo contract. */
  messageTransmitter: StarknetFelt;
  defaultRpcUrls: readonly string[];
  explorerUrl: string;
  /** Always `true` for Starknet — Circle ships Fast Transfer for Starknet. */
  supportsFastTransfer: boolean;
}

/**
 * The shape returned by registry lookups.
 */
export type ChainName = string;
