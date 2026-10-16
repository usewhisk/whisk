// Polyfill Node globals before any other import — @usewhisk/cctp
// transitively depends on @solana/web3.js and @stellar/stellar-sdk,
// both of which reach for Buffer at module load. Vite doesn't shim
// it by default.
import { Buffer } from "buffer";
if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}

import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";

createApp(App).mount("#app");
