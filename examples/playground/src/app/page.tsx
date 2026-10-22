import { ClientGate } from "./client-gate";

export default function Page() {
  return (
    <div className="pg-shell">
      <header className="pg-header">
        <span className="pg-brand">
          <span className="pg-brand__dot" aria-hidden="true" />
          <strong>whisk</strong>
          <span className="pg-brand__sep" aria-hidden="true">
            ·
          </span>
          playground
        </span>
        <nav className="pg-header__nav">
          <a
            href="https://www.usewhisk.xyz/docs"
            target="_blank"
            rel="noreferrer"
          >
            Docs ↗
          </a>
          <a
            href="https://github.com/Signor1/whisk"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
          <a href="https://x.com/usewhisk" target="_blank" rel="noreferrer">
            X ↗
          </a>
          <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
            USDC faucet ↗
          </a>
        </nav>
      </header>

      <ClientGate />

      <footer className="pg-footer">
        Powered by{" "}
        <a
          href="https://docs.arc.network/app-kit"
          target="_blank"
          rel="noreferrer"
        >
          Circle App Kit
        </a>
        {" · "}
        Open source on{" "}
        <a
          href="https://github.com/Signor1/whisk"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}
