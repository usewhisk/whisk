/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional. Enables the WalletConnect v2 connector. */
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
