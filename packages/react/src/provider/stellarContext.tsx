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
  /** Connected wallet's G-address. `null` until the user selects + connects. */
  address: string | null;
  /** ID of the currently selected wallet (e.g. `"freighter"`). */
  selectedWalletId: string | null;
  /** Wallets the kit knows about, including those not yet installed. */
  supportedWallets: ISupportedWallet[];
};

export type StellarWalletContextValue = StellarWalletState & {
  /** Underlying kit — exposed so the adapter can call `signTransaction`. */
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
 * Stellar wallet provider — instantiates a `StellarWalletsKit` once for
 * the lifetime of the `WhiskProvider`, exposes connection state, and
 * makes wallet picking + signing available to hooks/components below.
 *
 * The kit isn't a React context provider on its own (it's a plain
 * class), so we hold its state in React and surface it through this
 * lightweight wrapper. Modern browser wallets (Freighter, Albedo,
 * xBull, Lobstr, Hana, Rabet, Hot) are registered up front; only those
 * actually installed will appear as available in the picker.
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

  // Populate the supported-wallets list once on mount. Network state is
  // stable so a single fetch is sufficient.
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
        // Soft-fail — the modal will show an empty list and the user
        // can retry by reopening.
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
    // Modules with a real disconnect surface should be cleared (e.g.
    // WalletConnect-style sessions). Most extensions are stateless.
    try {
      await (kit as { disconnect?: () => Promise<void> }).disconnect?.();
    } catch {
      /* ignore */
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

/**
 * Read the Stellar wallet context. Returns `null` when `WhiskProvider`
 * wasn't given a `stellar()` factory — useful for ConnectModal to hide
 * the Stellar branch entirely in EVM-only builds.
 */
export function useStellarWallet(): StellarWalletContextValue | null {
  return useContext(StellarWalletContext);
}
