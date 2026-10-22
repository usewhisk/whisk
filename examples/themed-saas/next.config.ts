import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Trace from the monorepo root, not an outer checkout that holds a worktree.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@usewhisk/core", "@usewhisk/react"],
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /node_modules\/ox\// },
      /Critical dependency: the request of a dependency is an expression/,
    ];
    return config;
  },
};

export default config;
