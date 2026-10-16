import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // See `donate-button/vite.config.ts` for context.
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
