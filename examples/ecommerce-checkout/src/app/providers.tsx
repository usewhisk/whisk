"use client";

import { useMemo } from "react";
import { WhiskProvider, createWhiskConfig, evm } from "@usewhisk/react";

/**
 * <PaymentAside> pins both source and destination to Base Sepolia, so the
 * customer never picks a chain. Use the chain your back office settles
 * receivables on.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const config = useMemo(
    () =>
      createWhiskConfig({
        // Customer covers the bridge fees so the merchant receives the exact
        // cart total. Otherwise fees would be deducted from the price.
        feeBearer: "sender",
        wallets: [
          evm({
            chains: ["Arc_Testnet", "Base_Sepolia"],
            projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
            appName: "Atelier Hibiscus",
          }),
        ],
        chains: ["Arc_Testnet", "Base_Sepolia"],
        defaultSourceChain: "Arc_Testnet",
        defaultDestinationChain: "Arc_Testnet",
        appLabel: "whisk-example-ecommerce",
      }),
    [],
  );

  return (
    <WhiskProvider config={config} theme="light">
      {children}
    </WhiskProvider>
  );
}
