---
date: 2026-10-30
feature: Whisk Cloud client in core, not yet exported
scope: feat
scenario-impact: none
---

# Whisk Cloud client in core, not yet exported

The SDK side of the Whisk Cloud handshake (platform ADR Decision 6, milestone 2.2d),
in `packages/core/src/cloud`. Nothing here is exported from `@usewhisk/core`, so
published behaviour is unchanged. The 0.4 release, held until Whisk Cloud is hosted,
adds `appId` to the public config, wires this into the engine and the widget, and
turns on the mainnet app ID requirement.

- **Handshake:** `createCloudSession` posts `{ appId, sdkVersion }` to
  `/v1/sessions`, without credentials.
  - `state()` never waits on the network, so a payment never waits on Whisk Cloud.
  - `refresh()` never throws.
- **Token checks** (`verifySessionToken`), with WebCrypto, so core gains no
  dependency:
  - ES256 only, so `none` and every other algorithm are refused;
  - a key from the JWKS, fetched once per `kid`, at most once a minute;
  - this app ID as the audience;
  - this Whisk Cloud as the issuer;
  - not expired, and a known environment.
- **Fallback:** a token that does not verify is never used or stored. With Whisk
  Cloud unreachable or refusing, the SDK uses the last verified config until it
  expires, then local config alone.
- **Narrowing** (`parseRemoteConfig`, `narrowConfig`): remote config can only
  narrow local config.
  - It removes chains and routes, picks defaults among chains still enabled,
    pauses, and sets a brand name and accent colour.
  - It cannot add a chain. Fee, recipient and feature fields are ignored and
    reported, so a development build can warn about them.
  - Malformed fields are dropped, not guessed at, and a newer schema is ignored
    whole.
- **Network rule** (`assertSourceMatchesApp`): a live app ID with a testnet source
  chain, or a test app ID with a mainnet one, is a `ConfigError` before anything is
  signed.
- **Live test** (`cloud.integration.test.ts`): runs when `WHISK_CLOUD_TEST_URL` and
  `WHISK_CLOUD_TEST_APP_ID` are set. It passed against a local Whisk Cloud API: a
  real token verified against the real JWKS, and a refused origin fell back to
  local config.
