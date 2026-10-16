import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // @usewhisk/cctp transitively imports Buffer via @solana/web3.js
      // + @stellar/stellar-sdk. Point `buffer` to the browser-friendly
      // npm package so Vite doesn't tag it as an external.
      buffer: resolve(__dirname, "node_modules/buffer/index.js"),
      // Same idea for `crypto` — cctp uses @noble/hashes so it's
      // technically Buffer-free, but transitive deps still reach for
      // it. Point at an empty stub.
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
