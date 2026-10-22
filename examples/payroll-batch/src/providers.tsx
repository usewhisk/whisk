import { useMemo, type ReactNode } from "react";
import { WhiskProvider, createWhiskConfig, evm } from "@usewhisk/react";

export function Providers({ children }: { children: ReactNode }) {
  const config = useMemo(
    () =>
      createWhiskConfig({
        // The treasury pays the bridge fees so each contractor receives their
        // exact salary.
        feeBearer: "sender",
        wallets: [
          evm({
            chains: [
              "Arbitrum_Sepolia",
              "Arc_Testnet",
              "Base_Sepolia",
              "Optimism_Sepolia",
            ],
            projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
            appName: "Studio Fortune",
          }),
        ],
        chains: [
          "Arbitrum_Sepolia",
          "Arc_Testnet",
          "Base_Sepolia",
          "Optimism_Sepolia",
        ],
        // Payouts start on Arc, where gas is cheap, and each payment bridges
        // to the contractor's chain.
        defaultSourceChain: "Arc_Testnet",
        defaultDestinationChain: "Arc_Testnet",
        appLabel: "whisk-example-payroll",
      }),
    [],
  );

  return (
    <WhiskProvider config={config} theme="light">
      {children}
    </WhiskProvider>
  );
}
