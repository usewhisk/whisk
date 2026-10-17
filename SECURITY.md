# Security policy

Whisk moves user funds. If you find a security vulnerability,
**don't open a public issue or discussion** — disclosing exploitable
behaviour before there's a fix puts real users' money at risk.

## Reporting a vulnerability

**Use [GitHub's private vulnerability reporting](https://github.com/usewhisk/whisk/security/advisories/new)**:
click *Report a vulnerability*. GitHub keeps the report between you
and the maintainers until we publish an advisory.

If you can't use GitHub Security Advisories, email
**emmanuelomemgboji@gmail.com** with the same content.

### What to include

- A short description of impact — can funds be misrouted? Double-sent?
  Signature replayed? Recovery snapshot leaked?
- Reproduction steps: chain pair, wallet, widget config, the exact
  inputs that triggered it.
- Versions involved (`@usewhisk/core`, `@usewhisk/react`,
  `@circle-fin/app-kit`, viem).
- A working PoC is appreciated but not required.

## Scope

### In scope

Anything that can:

- Route a user's funds to an address they didn't consent to.
- Let a user double-sign or double-burn without realising.
- Make the recovery primitives (mid-flight retry, manual mint, Iris
  polling, persistence) produce wrong addresses or replay nonces.
- Leak entity secrets or PII via telemetry / logging.
- Bypass the resolver's address-shape validation.
- Allow cross-tab simultaneous signature prompts on the same wallet.
- Smuggle malicious code through the build / supply chain.

### Out of scope

- Issues in App Kit, viem, wagmi, the Solana wallet adapter, or other
  upstream dependencies. Report those to their respective projects.
- Issues in Circle's Iris service or `MessageTransmitter` contracts.
  Report those to Circle directly.
- Denial-of-service via RPC traffic (your RPC provider's concern).
- Insecure RPC endpoints the host app configured themselves.
- A wallet rejecting a transaction (expected behaviour).

## Response timeline

- Acknowledgement within **72 hours**.
- Severity assessment within **7 days**.
- High-severity patch within **14 days**; medium-severity rolls into
  the next minor release.
- Public advisory + credit (unless you ask for anonymity) after the
  patch lands and downstreams have a reasonable window to upgrade.

We won't pursue good-faith research, contact your employer, or
publish details before the fix is out.

## Supported versions

Whisk is pre-1.0. Only the most recent published minor receives
security patches:

| Version | Supported |
|---|---|
| `0.x` — current minor | ✅ |
| `0.x` — older minors | ❌ Upgrade |

After 1.0, this table will widen to cover at least the current and
previous major.

## Hall of fame

Researchers who report valid vulnerabilities are credited in the
advisory and listed here once the fix ships:

_No advisories published yet._
