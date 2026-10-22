// @usewhisk/cctp pulls in @solana/web3.js and @stellar/stellar-sdk, which
// read `Buffer` at load time. Vite does not provide it, so set it before
// any other import.
import { Buffer } from "buffer";
if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}

import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";

createApp(App).mount("#app");
