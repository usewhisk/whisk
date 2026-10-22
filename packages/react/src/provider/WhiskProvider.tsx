"use client";

import {
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
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
import { createBrowserInflightStore } from "../lib/inflightStore.js";
import { WhiskPortalContext } from "./portal.js";

export type WhiskProviderProps = {
  config: WhiskClientConfig;
  /**
   * Theme to apply to the widget.
   *
   * - `"light"` (default) or `"dark"` apply the matching preset.
   * - `"auto"` follows `prefers-color-scheme`, in CSS alone. SSR-safe.
   * - `"wine"`, `"indigo"`, `"emerald"`, `"monochrome"` apply named palettes.
   * - `{ preset, tokens }` replaces some tokens of a preset or of `"auto"`.
   * - A {@link WhiskTheme} object gives full control over every variable.
   */
  theme?: WhiskThemeInput;
  /** Reuse a host-app QueryClient. Outer `<QueryClientProvider>` is auto-detected. */
  queryClient?: QueryClient;
  children: ReactNode;
};

/**
 * Root provider for every Whisk widget and hook. Each wallet ecosystem is
 * mounted only when its factory is in `config.wallets`. An outer
 * `WagmiProvider` or `QueryClientProvider` is reused rather than replaced.
 *
 * The engine is created once on mount; later changes to `config` do not
 * reach it.
 */
export function WhiskProvider({
  config,
  theme = "light",
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
        resolver: config.resolver ?? createDefaultResolver(),
        feePolicy: config.feePolicy,
        feeBearer: config.feeBearer,
        rpcUrls: config.rpcUrls,
        useForwarder: config.useForwarder,
        appLabel: config.appLabel,
        inflightStore: config.inflightStore ?? createBrowserInflightStore(),
      }),
    // Built once per mount on purpose.
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

  // `useQueryClient` throws when no provider is in scope.
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

  const [portal, setPortal] = useState<HTMLElement | null>(null);
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
      <WhiskPortalContext.Provider value={portal}>
        {children}
      </WhiskPortalContext.Provider>
      <div data-whisk-portal="" ref={setPortal} />
    </div>
  );

  if (starknetConfig) {
    inner = (
      <StarknetWalletProvider config={starknetConfig}>
        {inner}
      </StarknetWalletProvider>
    );
  }

  if (stellarConfig) {
    inner = (
      <StellarWalletProvider config={stellarConfig}>
        {inner}
      </StellarWalletProvider>
    );
  }

  // Solana wallets announce themselves through Wallet Standard, so no
  // per-wallet adapters are bundled.
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
