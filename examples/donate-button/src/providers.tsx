import { useMemo, type ReactNode } from "react";
import { WhiskProvider, createWhiskConfig, evm, solana } from "@usewhisk/react";

/**
 * Donors pay from any listed chain, Solana Devnet included. The treasury is
 * an EVM address, so <DonateCard> pins the destination to Optimism Sepolia.
 *
 * In production, list the mainnet chains your donors use. Each transfer's
 * network comes from its source chain.
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
