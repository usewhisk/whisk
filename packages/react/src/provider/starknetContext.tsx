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

/** Combined "available (installed)" + "discovery (all known)" wallet entry. */
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
 * Starknet wallet provider — instantiates `get-starknet-core` once and
 * surfaces installed + discoverable wallets to the widget. The kit is a
 * plain object (not a React provider), so we wrap it in our own context.
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
        // Also include installed wallets not in the discovery list.
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
        // Ignore — the modal shows an empty list.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kit]);

  const selectWallet = useCallback(
    async (entry: StarknetWalletEntry) => {
      if (!entry.wallet) {
        // Discovery-only entry — the caller should send the user to the
        // install link. We don't try to open new tabs from here.
        throw new Error(`Wallet "${entry.name}" is not installed.`);
      }
      const enabled = await kit.enable(entry.wallet);
      // Fetch account address via RPC.
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
      /* ignore */
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
