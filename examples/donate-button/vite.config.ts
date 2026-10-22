import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * `buffer` points at the browser polyfill because `@usewhisk/cctp` pulls it
 * in through `@solana/web3.js` and `@stellar/stellar-sdk`, and Vite would
 * otherwise treat it as external. The async-storage and pino-pretty aliases
 * stub wagmi dependencies that have no browser build.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      buffer: resolve(__dirname, "node_modules/buffer/index.js"),
      "@react-native-async-storage/async-storage": "/src/stub-empty.ts",
      "pino-pretty": "/src/stub-empty.ts",
    },
  },
  define: {
    global: "globalThis",
    "process.env": "{}",
  },
  optimizeDeps: {
    include: ["buffer"],
    exclude: ["@react-native-async-storage/async-storage", "pino-pretty"],
  },
});
