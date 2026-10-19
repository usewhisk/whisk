import { createConfig } from "wagmi";
import {
  arbitrum,
  arbitrumSepolia,
  avalanche,
  avalancheFuji,
  base,
  baseSepolia,
  mainnet,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  sepolia,
} from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";
import { defineChain, fallback, http, type Chain as ViemChain } from "viem";
import { arc, arcTestnet } from "viem/chains";
import type { Chain } from "@usewhisk/core";
import type { EvmAdapterFactory } from "../types.js";

// Chain IDs MUST match App Kit's table — drift breaks `useSwitchChain` and
// wallet-side network detection. For chains where viem's built-in id disagrees
// (e.g. Sonic Testnet) or has no entry, `defineChain` inline.

const CODEX_MAINNET = defineChain({
  id: 81_224,
  name: "Codex",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.codex.xyz"] } },
  blockExplorers: {
    default: { name: "Codex Explorer", url: "https://explorer.codex.xyz" },
  },
});

const CODEX_TESTNET = defineChain({
  id: 812_242,
  name: "Codex Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.codex-stg.xyz"] } },
  blockExplorers: {
    default: { name: "Codex Explorer", url: "https://explorer.codex-stg.xyz" },
  },
  testnet: true,
});

const HYPER_EVM_MAINNET = defineChain({
  id: 999,
  name: "HyperEVM",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.hyperliquid.xyz/evm"] } },
  blockExplorers: {
    default: {
      name: "Hyperliquid Explorer",
      url: "https://app.hyperliquid.xyz/explorer",
    },
  },
});

const HYPER_EVM_TESTNET = defineChain({
  id: 998,
  name: "HyperEVM Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.hyperliquid-testnet.xyz/evm"] } },
  blockExplorers: {
    default: {
      name: "Hyperliquid Explorer",
      url: "https://app.hyperliquid-testnet.xyz/explorer",
    },
  },
  testnet: true,
});

const INK_MAINNET = defineChain({
  id: 57_073,
  name: "Ink",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc-gel.inkonchain.com"] } },
  blockExplorers: {
    default: { name: "Ink Explorer", url: "https://explorer.inkonchain.com" },
  },
});

const INK_TESTNET = defineChain({
  id: 763_373,
  name: "Ink Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc-gel-sepolia.inkonchain.com"] } },
  blockExplorers: {
    default: {
      name: "Ink Explorer",
      url: "https://explorer-sepolia.inkonchain.com",
    },
  },
  testnet: true,
});

const LINEA_MAINNET = defineChain({
  id: 59_144,
  name: "Linea",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.linea.build"] } },
  blockExplorers: {
    default: { name: "LineaScan", url: "https://lineascan.build" },
  },
});

const LINEA_SEPOLIA = defineChain({
  id: 59_141,
  name: "Linea Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.sepolia.linea.build"] } },
  blockExplorers: {
    default: { name: "LineaScan", url: "https://sepolia.lineascan.build" },
  },
  testnet: true,
});

const MONAD_MAINNET = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "Monad Explorer", url: "https://monadexplorer.com" },
  },
});

const MONAD_TESTNET = defineChain({
  id: 10_143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: "https://testnet.monadexplorer.com",
    },
  },
  testnet: true,
});

const PLUME_MAINNET = defineChain({
  id: 98_866,
  name: "Plume",
  nativeCurrency: { name: "Plume", symbol: "PLUME", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.plume.org"] } },
  blockExplorers: {
    default: { name: "Plume Explorer", url: "https://explorer.plume.org" },
  },
});

const PLUME_TESTNET = defineChain({
  id: 98_867,
  name: "Plume Testnet",
  nativeCurrency: { name: "Plume", symbol: "PLUME", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.plume.org"] } },
  blockExplorers: {
    default: {
      name: "Plume Explorer",
      url: "https://testnet-explorer.plume.org",
    },
  },
  testnet: true,
});

const SEI_MAINNET = defineChain({
  id: 1_329,
  name: "Sei",
  nativeCurrency: { name: "Sei", symbol: "SEI", decimals: 18 },
  rpcUrls: { default: { http: ["https://evm-rpc.sei-apis.com"] } },
  blockExplorers: {
    default: { name: "Seitrace", url: "https://seitrace.com" },
  },
});

const SEI_TESTNET = defineChain({
  id: 1_328,
  name: "Sei Testnet",
  nativeCurrency: { name: "Sei", symbol: "SEI", decimals: 18 },
  rpcUrls: { default: { http: ["https://evm-rpc-testnet.sei-apis.com"] } },
  blockExplorers: {
    default: { name: "Seitrace", url: "https://seitrace.com" },
  },
  testnet: true,
});

const SONIC_MAINNET = defineChain({
  id: 146,
  name: "Sonic",
  nativeCurrency: { name: "Sonic", symbol: "S", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.soniclabs.com"] } },
  blockExplorers: {
    default: { name: "Sonic Explorer", url: "https://sonicscan.org" },
  },
});

const SONIC_TESTNET = defineChain({
  id: 14_601,
  name: "Sonic Testnet",
  nativeCurrency: { name: "Sonic", symbol: "S", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.soniclabs.com"] } },
  blockExplorers: {
    default: { name: "Sonic Explorer", url: "https://testnet.sonicscan.org" },
  },
  testnet: true,
});

const UNICHAIN_MAINNET = defineChain({
  id: 130,
  name: "Unichain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.unichain.org"] } },
  blockExplorers: {
    default: { name: "Uniscan", url: "https://uniscan.xyz" },
  },
});

const UNICHAIN_SEPOLIA = defineChain({
  id: 1_301,
  name: "Unichain Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.unichain.org"] } },
  blockExplorers: {
    default: {
      name: "Uniscan",
      url: "https://unichain-sepolia.blockscout.com",
    },
  },
  testnet: true,
});

const WORLD_CHAIN_MAINNET = defineChain({
  id: 480,
  name: "World Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://worldchain-mainnet.g.alchemy.com/public"] },
  },
  blockExplorers: {
    default: { name: "Worldscan", url: "https://worldscan.org" },
  },
});

const WORLD_CHAIN_SEPOLIA = defineChain({
  id: 4_801,
  name: "World Chain Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://worldchain-sepolia.g.alchemy.com/public"] },
  },
  blockExplorers: {
    default: { name: "Worldscan", url: "https://sepolia.worldscan.org" },
  },
  testnet: true,
});

const XDC_MAINNET = defineChain({
  id: 50,
  name: "XDC",
  nativeCurrency: { name: "XDC", symbol: "XDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://erpc.xdcrpc.com"] } },
  blockExplorers: {
    default: { name: "XDC Explorer", url: "https://explorer.xdc.network" },
  },
});

const XDC_APOTHEM = defineChain({
  id: 51,
  name: "XDC Apothem",
  nativeCurrency: { name: "TXDC", symbol: "TXDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://erpc.apothem.network"] } },
  blockExplorers: {
    default: {
      name: "Apothem Explorer",
      url: "https://explorer.apothem.network",
    },
  },
  testnet: true,
});

const VIEM_CHAIN_BY_WHISK: Partial<Record<Chain, ViemChain>> = {
  // Mainnets
  Arbitrum: arbitrum,
  Arc: arc,
  Avalanche: avalanche,
  Base: base,
  Codex: CODEX_MAINNET,
  Ethereum: mainnet,
  HyperEVM: HYPER_EVM_MAINNET,
  Ink: INK_MAINNET,
  Linea: LINEA_MAINNET,
  Monad: MONAD_MAINNET,
  Optimism: optimism,
  Plume: PLUME_MAINNET,
  Polygon: polygon,
  Sei: SEI_MAINNET,
  Sonic: SONIC_MAINNET,
  Unichain: UNICHAIN_MAINNET,
  World_Chain: WORLD_CHAIN_MAINNET,
  XDC: XDC_MAINNET,
  // Testnets
  Arbitrum_Sepolia: arbitrumSepolia,
  Arc_Testnet: arcTestnet,
  Avalanche_Fuji: avalancheFuji,
  Base_Sepolia: baseSepolia,
  Codex_Testnet: CODEX_TESTNET,
  Ethereum_Sepolia: sepolia,
  HyperEVM_Testnet: HYPER_EVM_TESTNET,
  Ink_Testnet: INK_TESTNET,
  Linea_Sepolia: LINEA_SEPOLIA,
  Monad_Testnet: MONAD_TESTNET,
  Optimism_Sepolia: optimismSepolia,
  Plume_Testnet: PLUME_TESTNET,
  Polygon_Amoy_Testnet: polygonAmoy,
  Sei_Testnet: SEI_TESTNET,
  Sonic_Testnet: SONIC_TESTNET,
  Unichain_Sepolia: UNICHAIN_SEPOLIA,
  World_Chain_Sepolia: WORLD_CHAIN_SEPOLIA,
  XDC_Apothem: XDC_APOTHEM,
};

/** Source for `wallet_addEthereumChain` so MetaMask can add unknown long-tail chains. */
export function viemChainForWhisk(chain: Chain): ViemChain | undefined {
  return VIEM_CHAIN_BY_WHISK[chain];
}

export type EvmFactoryOptions = {
  chains?: Chain[];
  /** WalletConnect Cloud project ID — free at https://cloud.walletconnect.com. */
  projectId?: string;
  /** Pass an array for a viem `fallback` transport with latency ranking. */
  rpcUrls?: Partial<Record<Chain, string | string[]>>;
  /** Shown in WalletConnect / Coinbase pairing dialogs. */
  appName?: string;
};

export function evm(options: EvmFactoryOptions = {}): EvmAdapterFactory {
  const chainList = options.chains ?? [
    "Arc_Testnet",
    "Ethereum_Sepolia",
    "Base_Sepolia",
  ];
  const viemChains = chainList
    .map((c) => VIEM_CHAIN_BY_WHISK[c])
    .filter((c): c is ViemChain => Boolean(c));

  if (viemChains.length === 0) {
    // wagmi requires at least one chain to construct a Config.
    viemChains.push(sepolia);
  }

  const transports = Object.fromEntries(
    viemChains.map((chain) => {
      const whiskKey = whiskKeyForViemChain(chain.id, chainList);
      const configured = whiskKey ? options.rpcUrls?.[whiskKey] : undefined;

      if (Array.isArray(configured) && configured.length > 0) {
        return [
          chain.id,
          fallback(
            configured.map((url) => http(url)),
            { rank: true },
          ),
        ];
      }

      const url = typeof configured === "string" ? configured : undefined;
      return [chain.id, http(url)];
    }),
  );

  // Cast: wagmi requires a non-empty tuple, but TS can't narrow it through `.filter`.
  const config = createConfig({
    chains: viemChains as [ViemChain, ...ViemChain[]],
    transports,
    connectors: [
      injected({ shimDisconnect: true }),
      coinbaseWallet({ appName: options.appName ?? "Whisk" }),
      ...(options.projectId
        ? [
            walletConnect({
              projectId: options.projectId,
              metadata: {
                name: options.appName ?? "Whisk",
                description: "USDC widget powered by Whisk",
                url:
                  typeof window !== "undefined" ? window.location.origin : "",
                icons: [],
              },
            }),
          ]
        : []),
    ],
    ssr: true,
  });

  return { kind: "evm", config };
}

function whiskKeyForViemChain(
  viemId: number,
  whiskChains: Chain[],
): Chain | undefined {
  for (const chain of whiskChains) {
    const v = VIEM_CHAIN_BY_WHISK[chain];
    if (v?.id === viemId) return chain;
  }
  return undefined;
}
