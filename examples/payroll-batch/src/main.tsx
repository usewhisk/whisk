// Some wallet SDKs, and Solana support if you add it, expect Node's
// `Buffer` global. Vite does not provide it, so set it before any wallet
// code loads. This app is EVM-only and does not strictly need it yet.
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
