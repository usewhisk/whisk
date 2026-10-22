import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,

  // A worktree sits inside another checkout with its own lockfile, so Next
  // would otherwise pick the outer checkout as the root.
  outputFileTracingRoot: path.join(__dirname, "../.."),

  // Lets `pnpm dev` run the workspace packages from source without building
  // their dist first.
  transpilePackages: ["@usewhisk/core", "@usewhisk/react"],

  webpack: (config) => {
    // wagmi's connectors import optional deps the browser never runs:
    // async-storage (MetaMask SDK) and pino-pretty (WalletConnect logger).
    // `false` makes webpack treat them as empty modules, the usual wagmi and
    // Next.js setup.
    config.resolve = config.resolve ?? {};
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };

    // viem's `ox` dependency uses dynamic imports, which webpack reports as
    // a "Critical dependency" warning. It is harmless.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /node_modules\/ox\// },
      /Critical dependency: the request of a dependency is an expression/,
    ];

    return config;
  },
};

export default config;
