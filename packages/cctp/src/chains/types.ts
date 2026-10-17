export type Network = "mainnet" | "testnet";

export type Ecosystem = "evm" | "solana" | "stellar" | "starknet";

/** Assigned by Circle. Mainnet and testnet share a domain; Iris tells them apart by host. */
export type CctpDomain = number;

export type EvmChainId = number;

export type Address = `0x${string}`;

export type SolanaPubkey = string;

export type SolanaCluster = "mainnet-beta" | "devnet";

/** G (account), M (muxed account) or C (contract). */
export type StellarStrkey = string;

export type StellarNetwork = "public" | "testnet";

export type StarknetNetwork = "mainnet" | "sepolia";

export type StarknetFelt = `0x${string}`;

/** From Circle's CCTP tables, per chain. */
export interface ChainCapabilities {
  /** Fast Transfer is offered with this chain as the source. */
  fastSource: boolean;
  /** Circle's Forwarding Service can mint on this chain. */
  forwardingDestination: boolean;
  /** Iris quotes an upfront fee for burns from this chain. */
  upfrontFeeSource: boolean;
}

interface ChainBase {
  /** Circle App Kit `Blockchain` string, such as "Arc" or "Base_Sepolia". */
  id: string;
  label: string;
  network: Network;
  cctpDomain: CctpDomain;
  usdcDecimals: 6 | 7;
  nativeCurrency: { symbol: string; decimals: number };
  defaultRpcUrls: readonly string[];
  explorerUrl: string;
  /** Appended to explorer links, for explorers that serve several networks. */
  explorerQuery?: string;
  capabilities: ChainCapabilities;
}

export interface EvmChain extends ChainBase {
  ecosystem: "evm";
  evmChainId: EvmChainId;
  usdc: Address;
  tokenMessenger: Address;
  messageTransmitter: Address;
}

export interface SolanaChain extends ChainBase {
  ecosystem: "solana";
  cluster: SolanaCluster;
  usdc: SolanaPubkey;
  /** Solana merges TokenMessenger and TokenMinter into one program. */
  tokenMessengerMinter: SolanaPubkey;
  messageTransmitter: SolanaPubkey;
}

export interface StellarChain extends ChainBase {
  ecosystem: "stellar";
  stellarNetwork: StellarNetwork;
  networkPassphrase: string;
  usdcIssuer: StellarStrkey;
  /** The USDC Stellar Asset Contract, derived from the issuer and passphrase. */
  usdc: StellarStrkey;
  tokenMessengerMinter: StellarStrkey;
  messageTransmitter: StellarStrkey;
  /**
   * Every burn to Stellar must name this contract as both `mintRecipient` and
   * `destinationCaller`, with the real recipient in hookData. A user key as
   * `mintRecipient` loses the funds.
   */
  cctpForwarder: StellarStrkey;
}

export interface StarknetChain extends ChainBase {
  ecosystem: "starknet";
  starknetNetwork: StarknetNetwork;
  /** Shortstring felt, such as `SN_SEPOLIA`, that wallets check when signing. */
  chainId: StarknetFelt;
  usdc: StarknetFelt;
  tokenMessengerMinter: StarknetFelt;
  messageTransmitter: StarknetFelt;
}

export type CctpChain = EvmChain | SolanaChain | StellarChain | StarknetChain;
