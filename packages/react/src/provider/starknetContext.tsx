"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getStarknet,
  type GetStarknetResult,
  type StarknetWindowObject,
  type WalletProvider,
} from "@starknet-io/get-starknet-core";
import type { StarknetConfig } from "../config/adapters/starknet.js";

/** A known Starknet wallet, installed or not. */
export type StarknetWalletEntry = {
  id: string;
  name: string;
  icon: string;
  /** Present when the wallet is already injected in the page. */
  wallet?: StarknetWindowObject;
  /** Present for discovery entries (not yet installed). */
  install?: WalletProvider;
};

export type StarknetWalletState = {
  address: string | null;
  wallet: StarknetWindowObject | null;
  supportedWallets: StarknetWalletEntry[];
};

export type StarknetWalletContextValue = StarknetWalletState & {
  kit: GetStarknetResult;
  config: StarknetConfig;
  selectWallet: (entry: StarknetWalletEntry) => Promise<void>;
  disconnect: () => Promise<void>;
};

const StarknetWalletContext = createContext<StarknetWalletContextValue | null>(
  null,
);

export type StarknetWalletProviderProps = {
  config: StarknetConfig;
  children: ReactNode;
};

/**
 * Holds one `get-starknet-core` instance for the life of the provider. It is
 * a plain object with no React state, so connection state lives here.
 */
export function StarknetWalletProvider({
  config,
  children,
}: StarknetWalletProviderProps) {
  const kitRef = useRef<GetStarknetResult | null>(null);
  if (!kitRef.current) {
    kitRef.current = getStarknet();
  }
  const kit = kitRef.current;

  const [state, setState] = useState<StarknetWalletState>({
    address: null,
    wallet: null,
    supportedWallets: [],
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [installed, discovery] = await Promise.all([
          kit.getAvailableWallets(),
          kit.getDiscoveryWallets(),
        ]);
        const installedById = new Map(installed.map((w) => [w.id, w]));
        const entries: StarknetWalletEntry[] = discovery.map((d) => {
          const installedWallet = installedById.get(d.id);
          return {
            id: d.id,
            name: d.name,
            icon: d.icon,
            ...(installedWallet && { wallet: installedWallet }),
            ...(installedWallet ? {} : { install: d }),
          };
        });
        // Installed wallets that the discovery list does not know about.
        for (const w of installed) {
          if (!entries.some((e) => e.id === w.id)) {
            const icon =
              typeof w.icon === "string" ? w.icon : (w.icon?.light ?? "");
            entries.push({ id: w.id, name: w.name, icon, wallet: w });
          }
        }
        if (!cancelled) {
          setState((prev) => ({ ...prev, supportedWallets: entries }));
        }
      } catch {
        // The modal shows an empty list instead.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kit]);

  const selectWallet = useCallback(
    async (entry: StarknetWalletEntry) => {
      if (!entry.wallet) {
        // The caller sends the user to the install link; no tab is opened here.
        throw new Error(`Wallet "${entry.name}" is not installed.`);
      }
      const enabled = await kit.enable(entry.wallet);
      const accounts = await enabled.request({
        type: "wallet_requestAccounts",
      });
      const address = Array.isArray(accounts) ? accounts[0] : undefined;
      if (!address) {
        throw new Error(`${entry.name}: no account returned.`);
      }
      setState((prev) => ({ ...prev, address, wallet: enabled }));
    },
    [kit],
  );

  const disconnect = useCallback(async () => {
    try {
      await kit.disconnect({ clearLastWallet: true });
    } catch {
      /* the address is cleared below either way */
    }
    setState((prev) => ({ ...prev, address: null, wallet: null }));
  }, [kit]);

  const value = useMemo<StarknetWalletContextValue>(
    () => ({
      ...state,
      kit,
      config,
      selectWallet,
      disconnect,
    }),
    [state, kit, config, selectWallet, disconnect],
  );

  return (
    <StarknetWalletContext.Provider value={value}>
      {children}
    </StarknetWalletContext.Provider>
  );
}

export function useStarknetWallet(): StarknetWalletContextValue | null {
  return useContext(StarknetWalletContext);
}
