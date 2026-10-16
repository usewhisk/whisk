/**
 * Chain registry — public surface.
 */
export type {
  Address,
  CctpChain,
  CctpDomain,
  CctpEcosystem,
  CctpNetwork,
  ChainName,
  EvmChainId,
  EvmCctpChain,
  SolanaCctpChain,
  SolanaCluster,
  SolanaPubkey,
  StarknetCctpChain,
  StarknetFelt,
  StarknetNetwork,
  StellarCctpChain,
  StellarNetwork,
  StellarStrkey,
} from "./types.js";

export {
  UnknownChainError,
  allChains,
  chainsByNetwork,
  getChain,
  tryGetChain,
  chainByEvmChainId,
  tryChainByEvmChainId,
  chainBySolanaCluster,
  tryChainBySolanaCluster,
  chainByStellarNetwork,
  tryChainByStellarNetwork,
  chainByStarknetNetwork,
  tryChainByStarknetNetwork,
  chainByDomain,
  tryChainByDomain,
  explorerTxUrl,
  explorerAddressUrl,
  isEvmChain,
  isSolanaChain,
  isStellarChain,
  isStarknetChain,
} from "./registry.js";

export {
  TOKEN_MESSENGER_V2_EVM_MAINNET,
  MESSAGE_TRANSMITTER_V2_EVM_MAINNET,
  TOKEN_MESSENGER_V2_EVM_TESTNET,
  MESSAGE_TRANSMITTER_V2_EVM_TESTNET,
  TOKEN_MESSENGER_MINTER_V2_SOLANA,
  MESSAGE_TRANSMITTER_V2_SOLANA,
  USDC_SPL_MAINNET,
  USDC_SPL_DEVNET,
  SOLANA_CCTP_DOMAIN,
  TOKEN_MESSENGER_MINTER_STELLAR_MAINNET,
  TOKEN_MESSENGER_MINTER_STELLAR_TESTNET,
  MESSAGE_TRANSMITTER_STELLAR_MAINNET,
  MESSAGE_TRANSMITTER_STELLAR_TESTNET,
  CCTP_FORWARDER_STELLAR_MAINNET,
  CCTP_FORWARDER_STELLAR_TESTNET,
  USDC_ISSUER_STELLAR_MAINNET,
  USDC_ISSUER_STELLAR_TESTNET,
  STELLAR_NETWORK_PASSPHRASE_MAINNET,
  STELLAR_NETWORK_PASSPHRASE_TESTNET,
  STELLAR_CCTP_DOMAIN,
  STELLAR_USDC_DECIMALS,
  CCTP_USDC_DECIMALS,
  TOKEN_MESSENGER_MINTER_V2_STARKNET_MAINNET,
  TOKEN_MESSENGER_MINTER_V2_STARKNET_SEPOLIA,
  MESSAGE_TRANSMITTER_V2_STARKNET_MAINNET,
  MESSAGE_TRANSMITTER_V2_STARKNET_SEPOLIA,
  USDC_STARKNET_MAINNET,
  USDC_STARKNET_SEPOLIA,
  STARKNET_CHAIN_ID_MAINNET,
  STARKNET_CHAIN_ID_SEPOLIA,
  STARKNET_CCTP_DOMAIN,
} from "./constants.js";

// Re-export individual chain definitions so callers can import a single
// chain by name when they don't want the whole list.
export {
  Ethereum,
  Avalanche,
  Optimism,
  Arbitrum,
  Base,
  Polygon,
  Unichain,
  Linea,
  WorldChain,
  MAINNET_CHAINS,
} from "./mainnet.js";

export {
  EthereumSepolia,
  AvalancheFuji,
  OptimismSepolia,
  ArbitrumSepolia,
  BaseSepolia,
  PolygonAmoy,
  UnichainSepolia,
  LineaSepolia,
  WorldChainSepolia,
  TESTNET_CHAINS,
} from "./testnet.js";

export { Solana, SolanaDevnet } from "./solana.js";
export { Stellar, StellarTestnet } from "./stellar.js";
export { Starknet, StarknetSepolia } from "./starknet.js";
