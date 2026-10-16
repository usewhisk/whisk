import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * Vite config for a Whisk SPA. Aliases:
 *   - `buffer` → the browser polyfill package. `@usewhisk/cctp`
 *     transitively imports Buffer via `@solana/web3.js` /
 *     `@stellar/stellar-sdk`; Vite otherwise tags it as an external.
 *   - `@react-native-async-storage/async-storage`, `pino-pretty` →
 *     stubbed. Wagmi's transitive deps that don't ship a browser
 *     build.
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
