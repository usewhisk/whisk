import { useMemo, type ReactNode } from "react";
import { WhiskProvider, createWhiskConfig, evm } from "@usewhisk/react";

export function Providers({ children }: { children: ReactNode }) {
  const config = useMemo(
    () =>
      createWhiskConfig({
        // Studio treasury covers the bridge fees so each contractor is paid
        // their exact salary, net of nothing.
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
        // Treasury sits on Arc for cheap outgoing payouts; each dispatch
        // then bridges to the contractor's preferred chain.
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
