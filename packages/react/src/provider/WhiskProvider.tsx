"use client";

import { useContext, useMemo, type CSSProperties, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { WagmiProvider, WagmiContext, type Config as WagmiConfig } from "wagmi";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { createWhisk, ConfigError } from "@usewhisk/core";
import type { WhiskClientConfig } from "../config/types.js";
import type { SolanaConfig } from "../config/adapters/solana.js";
import type { StarknetConfig } from "../config/adapters/starknet.js";
import type { StellarConfig } from "../config/adapters/stellar.js";
import { createDefaultResolver } from "../resolvers/index.js";
import { resolveTheme } from "../theme/index.js";
import type { WhiskThemeInput } from "../theme/index.js";
import { WhiskContext, type WhiskContextValue } from "./context.js";
import { StellarWalletProvider } from "./stellarContext.js";
import { StarknetWalletProvider } from "./starknetContext.js";

export type WhiskProviderProps = {
  config: WhiskClientConfig;
  /**
   * Theme to apply to the widget.
   *
   * - `"system"` (default) defers to `prefers-color-scheme`. SSR-safe.
   * - `"light"` or `"dark"` apply the matching preset.
   * - `"wine"`, `"indigo"`, `"emerald"`, `"monochrome"` apply named palettes.
   * - A {@link WhiskTheme} object gives full control over every variable.
   */
  theme?: WhiskThemeInput;
  /** Reuse a host-app QueryClient. Outer `<QueryClientProvider>` is auto-detected. */
  queryClient?: QueryClient;
  children: ReactNode;
};

/**
 * Root provider for every Whisk widget and hook.
 *
 * Composes wagmi (EVM) + Wallet Standard via `@solana/wallet-adapter-react`
 * (Solana) + TanStack Query around the engine. Each ecosystem is mounted
 * only when its factory is present in `config.wallets`, so EVM-only apps
 * don't pay for the Solana tree and vice versa.
 *
 * When an outer `WagmiProvider` or `QueryClientProvider` is already
 * mounted, this provider detects and reuses them — host-app contexts
 * always win.
 */
export function WhiskProvider({
  config,
  theme = "system",
  queryClient: externalQueryClient,
  children,
}: WhiskProviderProps) {
  const engine = useMemo(
    () =>
      createWhisk({
        chains: config.chains,
        defaultSourceChain: config.defaultSourceChain,
        defaultDestinationChain: config.defaultDestinationChain,
        token: config.token,
        resolver:
          config.resolver ?? createDefaultResolver({ mode: config.mode }),
        feePolicy: config.feePolicy,
        feeBearer: config.feeBearer,
        rpcUrls: config.rpcUrls,
        useForwarder: config.useForwarder,
        mode: config.mode,
        appLabel: config.appLabel,
      }),
    // Engine config is intentionally frozen for the provider's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const contextValue: WhiskContextValue = useMemo(
    () => ({ engine, config, theme }),
    [engine, config, theme],
  );

  const evmFactory = config.wallets.find((w) => w.kind === "evm");
  const solanaFactory = config.wallets.find((w) => w.kind === "solana");
  const stellarFactory = config.wallets.find((w) => w.kind === "stellar");
  const starknetFactory = config.wallets.find((w) => w.kind === "starknet");
  const solanaConfig =
    (solanaFactory?.config as SolanaConfig | undefined) ?? undefined;
  const stellarConfig =
    (stellarFactory?.config as StellarConfig | undefined) ?? undefined;
  const starknetConfig =
    (starknetFactory?.config as StarknetConfig | undefined) ?? undefined;

  // `useContext` is a hook — call it unconditionally so its slot in the
  // call tree is stable. `useQueryClient` throws when no provider is in
  // scope, so wrap it in try/catch.
  const outerWagmiConfig = useContext(WagmiContext);
  const hasOuterWagmi = !!outerWagmiConfig;

  let outerQueryClient: QueryClient | undefined;
  try {
    outerQueryClient = useQueryClient();
  } catch {
    outerQueryClient = undefined;
  }

  if (
    !evmFactory &&
    !hasOuterWagmi &&
    !solanaFactory &&
    !stellarFactory &&
    !starknetFactory
  ) {
    throw new ConfigError(
      "WhiskProvider: include evm(), solana(), stellar(), and/or starknet() in config.wallets, or mount this provider inside an existing wallet context.",
    );
  }

  const ourWagmiConfig: WagmiConfig | undefined =
    !hasOuterWagmi && evmFactory
      ? (evmFactory.config as WagmiConfig)
      : undefined;

  const ourQueryClient = useMemo(
    () => externalQueryClient ?? new QueryClient(),
    [externalQueryClient],
  );

  const resolved = resolveTheme(theme);
  const themeAttr = resolved?.colorMode;
  const inlineStyle = resolved?.vars as CSSProperties | undefined;

  let inner: ReactNode = (
    <div
      data-whisk=""
      data-whisk-theme={themeAttr}
      className={themeAttr === "dark" ? "dark" : undefined}
      style={inlineStyle}
    >
      {children}
    </div>
  );

  // Starknet wallet tree — get-starknet-core is a plain kit, wrapped in
  // our own React context.
  if (starknetConfig) {
    inner = (
      <StarknetWalletProvider config={starknetConfig}>
        {inner}
      </StarknetWalletProvider>
    );
  }

  // Stellar wallet tree — wraps the existing inner. The kit is a plain
  // class, not a provider; we surface its state via React context.
  if (stellarConfig) {
    inner = (
      <StellarWalletProvider config={stellarConfig}>
        {inner}
      </StellarWalletProvider>
    );
  }

  // Solana wallet tree — wraps the existing inner. Modern Solana wallets
  // advertise via Wallet Standard, so an empty `wallets={[]}` is correct
  // and avoids dragging in per-wallet bundles.
  if (solanaConfig) {
    inner = (
      <ConnectionProvider endpoint={solanaConfig.endpoint}>
        <WalletProvider wallets={[]} autoConnect={solanaConfig.autoConnect}>
          {inner}
        </WalletProvider>
      </ConnectionProvider>
    );
  }

  if (ourWagmiConfig) {
    inner = <WagmiProvider config={ourWagmiConfig}>{inner}</WagmiProvider>;
  }

  if (!outerQueryClient) {
    inner = (
      <QueryClientProvider client={ourQueryClient}>{inner}</QueryClientProvider>
    );
  }

  return (
    <WhiskContext.Provider value={contextValue}>{inner}</WhiskContext.Provider>
  );
}
