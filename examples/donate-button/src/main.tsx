// @solana/web3.js expects Node's `Buffer` global. Next.js polyfills it but
// Vite does not, so set it before any Solana code loads or a Solana bridge
// throws "Buffer is not defined".
import { Buffer } from "buffer";
if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}

import React from "react";
import ReactDOM from "react-dom/client";
import "@usewhisk/react/styles.css";
import "./styles.css";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
