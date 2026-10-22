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
  AlbedoModule,
  FreighterModule,
  HanaModule,
  HotWalletModule,
  LobstrModule,
  RabetModule,
  StellarWalletsKit,
  WalletNetwork,
  xBullModule,
  type ISupportedWallet,
} from "@creit.tech/stellar-wallets-kit";
import type { StellarConfig } from "../config/adapters/stellar.js";

export type StellarWalletState = {
  /** Connected wallet's G-address. `null` until the user connects one. */
  address: string | null;
  /** ID of the currently selected wallet (e.g. `"freighter"`). */
  selectedWalletId: string | null;
  /** Wallets the kit knows about, including those not yet installed. */
  supportedWallets: ISupportedWallet[];
};

export type StellarWalletContextValue = StellarWalletState & {
  /** Exposed so the adapter can call `signTransaction`. */
  kit: StellarWalletsKit;
  /** Effective Stellar config (network passphrase, RPC). */
  config: StellarConfig;
  /** Select a wallet by id (e.g. `"freighter"`), then read its address. */
  selectWallet: (id: string) => Promise<void>;
  /** Clear the connected address. */
  disconnect: () => Promise<void>;
};

const StellarWalletContext = createContext<StellarWalletContextValue | null>(
  null,
);

export type StellarWalletProviderProps = {
  config: StellarConfig;
  children: ReactNode;
};

/**
 * Holds one `StellarWalletsKit` for the life of the provider. The kit is a
 * plain class with no React state, so connection state lives here.
 */
export function StellarWalletProvider({
  config,
  children,
}: StellarWalletProviderProps) {
  const kitRef = useRef<StellarWalletsKit | null>(null);
  if (!kitRef.current) {
    kitRef.current = new StellarWalletsKit({
      network:
        config.network === "public"
          ? WalletNetwork.PUBLIC
          : WalletNetwork.TESTNET,
      modules: [
        new FreighterModule(),
        new AlbedoModule(),
        new xBullModule(),
        new LobstrModule(),
        new HanaModule(),
        new RabetModule(),
        new HotWalletModule(),
      ],
    });
  }
  const kit = kitRef.current;

  const [state, setState] = useState<StellarWalletState>({
    address: null,
    selectedWalletId: null,
    supportedWallets: [],
  });

  // The network cannot change after mount, so one fetch is enough.
  useEffect(() => {
    let cancelled = false;
    kit
      .getSupportedWallets()
      .then((wallets) => {
        if (!cancelled) {
          setState((prev) => ({ ...prev, supportedWallets: wallets }));
        }
      })
      .catch(() => {
        // The modal shows an empty list instead.
      });
    return () => {
      cancelled = true;
    };
  }, [kit]);

  const selectWallet = useCallback(
    async (id: string) => {
      kit.setWallet(id);
      const { address } = await kit.getAddress();
      setState((prev) => ({ ...prev, address, selectedWalletId: id }));
    },
    [kit],
  );

  const disconnect = useCallback(async () => {
    // Only session-based modules such as WalletConnect have a disconnect.
    try {
      await (kit as { disconnect?: () => Promise<void> }).disconnect?.();
    } catch {
      /* the address is cleared below either way */
    }
    setState((prev) => ({ ...prev, address: null, selectedWalletId: null }));
  }, [kit]);

  const value = useMemo<StellarWalletContextValue>(
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
    <StellarWalletContext.Provider value={value}>
      {children}
    </StellarWalletContext.Provider>
  );
}

/** `null` when `WhiskProvider` was not given a `stellar()` factory. */
export function useStellarWallet(): StellarWalletContextValue | null {
  return useContext(StellarWalletContext);
}
