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
 * Every CCTP V2 testnet Whisk supports today — one entry per Circle
 * domain. The playground exposes the full set so the chain picker
 * mirrors what production apps will see.
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

/** Re-exported so the controls panel can render a chain picker without
 *  duplicating the list. */
export const PLAYGROUND_CHAINS = TESTNET_CHAINS;

/**
 * Whisk's provider stack. `theme` is reactive — the WhiskProvider
 * only changes one DOM attribute (`data-whisk-theme`) when it flips,
 * so toggling theme from the controls panel does NOT remount wagmi
 * or react-query underneath. Wallet connection survives a theme
 * change.
 *
 * `config` is memoized on `feeBearer` — almost every knob lives on
 * `<WhiskSend>` props or the reactive `theme` prop, but `feeBearer` is
 * part of `createWhiskConfig`, which the engine reads once at creation.
 * The `key={feeBearer}` on the provider forces a clean remount when it
 * flips, so a fresh engine picks up the new fee policy. (Toggling it
 * therefore drops the wallet connection — fine for a QA knob.)
 */
export function PlaygroundProviders({
  theme,
  feeBearer,
  children,
}: {
  theme: "system" | "light" | "dark";
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
          // Solana Devnet — factory defaults to devnet.
          solana(),
          // Stellar Testnet — mounts the Stellar Wallets Kit context.
          stellar(),
          // Starknet Sepolia — mounts get-starknet-core wallet
          // discovery for Argent X, Braavos, and friends.
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
