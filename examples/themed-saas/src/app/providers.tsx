"use client";

import { useMemo } from "react";
import { WhiskProvider, createWhiskConfig, evm } from "@usewhisk/react";

export function Providers({ children }: { children: React.ReactNode }) {
  const config = useMemo(
    () =>
      createWhiskConfig({
        // Treasury covers the bridge fees so each vendor receives their exact
        // invoiced amount.
        feeBearer: "sender",
        wallets: [
          evm({
            chains: ["Arc_Testnet", "Base_Sepolia"],
            projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
            appName: "Steelpath Cloud",
          }),
        ],
        chains: ["Arc_Testnet", "Base_Sepolia"],
        defaultSourceChain: "Arc_Testnet",
        defaultDestinationChain: "Arc_Testnet",
        appLabel: "whisk-example-themed-saas",
      }),
    [],
  );

  return (
    <WhiskProvider config={config} theme="dark">
      {children}
    </WhiskProvider>
  );
}
