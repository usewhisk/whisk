import { useMemo, type ReactNode } from "react";
import { WhiskProvider, createWhiskConfig, evm, solana } from "@usewhisk/react";

/**
 * Donors bring their own chain. Treasury is EVM-format so the destination
 * is pinned to Arc Testnet in <DonateCard>; sources include both EVM testnets
 * and Solana Devnet — CCTP bridges Solana → EVM cross-ecosystem.
 *
 * For production you'd list the mainnet chains your treasury monitors. The
 * network of each transfer comes from its source chain.
 */
export function Providers({ children }: { children: ReactNode }) {
  const config = useMemo(
    () =>
      createWhiskConfig({
        // Donor covers the bridge fees so the treasury receives the full tier
        // amount (a $25 donation lands as $25, not $25 minus fees).
        feeBearer: "sender",
        wallets: [
          evm({
            chains: [
              "Arc_Testnet",
              "Base_Sepolia",
              "Ethereum_Sepolia",
              "Optimism_Sepolia",
            ],
            projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
            appName: "OpenForest",
          }),
          solana({ network: "devnet" }),
        ],
        chains: [
          "Arc_Testnet",
          "Base_Sepolia",
          "Ethereum_Sepolia",
          "Optimism_Sepolia",
          "Solana_Devnet",
        ],
        // Donors give from any chain (incl. Ethereum + Solana); the treasury
        // receives on Optimism, an L2 where the Forwarder mint fee is cents,
        // not the dollars it costs to mint on Ethereum L1.
        defaultSourceChain: "Arc_Testnet",
        defaultDestinationChain: "Optimism_Sepolia",
        appLabel: "whisk-example-donate",
      }),
    [],
  );

  return (
    <WhiskProvider config={config} theme="light">
      {children}
    </WhiskProvider>
  );
}
