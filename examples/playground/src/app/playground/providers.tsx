"use client";

import { useMemo } from "react";
import {
  WhiskProvider,
  createWhiskConfig,
  evm,
  solana,
  starknet,
  stellar,
  type Chain,
  type FeeBearer,
} from "@usewhisk/react";

/**
 * Every CCTP V2 testnet Whisk supports, so the widget's chain pickers show
 * the full set a production app could offer.
 */
const TESTNET_CHAINS: Chain[] = [
  "Arc_Testnet",
  "Arbitrum_Sepolia",
  "Avalanche_Fuji",
  "Base_Sepolia",
  "Ethereum_Sepolia",
  "Linea_Sepolia",
  "Optimism_Sepolia",
  "Polygon_Amoy_Testnet",
  "Solana_Devnet",
  "Starknet_Sepolia",
  "Stellar_Testnet",
  "Unichain_Sepolia",
  "World_Chain_Sepolia",
];

export const PLAYGROUND_CHAINS = TESTNET_CHAINS;

/**
 * Changing `theme` only updates the provider's `data-whisk-theme`
 * attribute, so wagmi stays mounted and the wallet stays connected.
 *
 * `feeBearer` is read once when the engine is created, so
 * `key={feeBearer}` remounts the provider with a fresh engine when it
 * changes. That drops the wallet connection, which is fine for a test knob.
 */
export function PlaygroundProviders({
  theme,
  feeBearer,
  children,
}: {
  theme: "auto" | "light" | "dark";
  feeBearer: FeeBearer;
  children: React.ReactNode;
}) {
  const config = useMemo(
    () =>
      createWhiskConfig({
        feeBearer,
        wallets: [
          evm({
            chains: TESTNET_CHAINS,
            projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
            appName: "Whisk Playground",
          }),
          // Defaults to devnet.
          solana(),
          // Defaults to testnet.
          stellar(),
          // Defaults to Sepolia and discovers Argent X, Braavos and other
          // injected wallets.
          starknet(),
        ],
        chains: TESTNET_CHAINS,
        defaultSourceChain: "Arc_Testnet",
        defaultDestinationChain: "Base_Sepolia",
        appLabel: "whisk-playground",
      }),
    [feeBearer],
  );

  return (
    <WhiskProvider key={feeBearer} config={config} theme={theme}>
      {children}
    </WhiskProvider>
  );
}
