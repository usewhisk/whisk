export { createWhiskConfig } from "./createWhiskConfig.js";
export type {
  CreateWhiskConfigOptions,
  EvmAdapterFactory,
  SolanaAdapterFactory,
  StarknetAdapterFactory,
  StellarAdapterFactory,
  WalletAdapterFactory,
  WhiskClientConfig,
} from "./types.js";

// Re-export `WhiskMode` from core so consumers can type-annotate their
// own `mode: WhiskMode` props without importing core directly.
export type { WhiskMode } from "@usewhisk/core";

export { evm } from "./adapters/evm.js";
export type { EvmFactoryOptions } from "./adapters/evm.js";

export { solana } from "./adapters/solana.js";
export type {
  SolanaConfig,
  SolanaFactoryOptions,
  SolanaNetwork,
} from "./adapters/solana.js";

export { stellar } from "./adapters/stellar.js";
export type {
  StellarConfig,
  StellarFactoryOptions,
  StellarNetwork,
} from "./adapters/stellar.js";

export { starknet } from "./adapters/starknet.js";
export type {
  StarknetConfig,
  StarknetFactoryOptions,
  StarknetNetwork,
} from "./adapters/starknet.js";
