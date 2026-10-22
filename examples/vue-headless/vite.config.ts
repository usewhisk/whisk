import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // @usewhisk/cctp pulls in Buffer through @solana/web3.js and
      // @stellar/stellar-sdk. Use the npm polyfill so Vite does not treat
      // it as external.
      buffer: resolve(__dirname, "node_modules/buffer/index.js"),
      // cctp hashes with @noble/hashes, but some dependencies still import
      // Node's `crypto`. Nothing calls it in the browser.
      crypto: resolve(__dirname, "src/stub-empty.ts"),
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
