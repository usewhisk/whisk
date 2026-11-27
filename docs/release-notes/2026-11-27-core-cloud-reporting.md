---
date: 2026-11-27
feature: Whisk Cloud screening and transfer reporting in core, not yet exported
scope: feat
scenario-impact: none
---

# Whisk Cloud screening and transfer reporting in core, not yet exported

The SDK side of platform milestone 2.3f, in `packages/core/src/cloud`, beside the
2.2d handshake. Nothing new is exported from `@usewhisk/core`, so published
behaviour is unchanged. The held 0.4 release wires it into `createWhisk` and the
widget, with the public `appId`.

- **Session token** (`CloudSession.token()`): the verified token from this page's
  own handshake, held in memory and never stored. It shakes hands again when there
  is none, within a minute of expiry, or when Whisk Cloud refused the last one.
- **Screening** (`createCloudApi().screen`): posts the payer and the recipient to
  `/v1/screen` with the token.
  - It answers `clear`, `hit`, `partial` or `unavailable`, and never throws. An
    outage, a timeout after 4 seconds, no session, or an answer that does not read
    are all `unavailable`.
  - `assertScreened` throws `ScreeningError` on a hit, and on `partial` or
    `unavailable` when the app fails closed. Its message, "This payment can't be
    completed.", names no one, and the widget already shows a quote error's
    message as it is.
- **Fail closed:** remote config's `screening.failClosed` is parsed, false when
  missing, and dropped and reported when malformed. `narrowConfig` fails closed
  when either the remote config or the integrator's code asks, since it can only
  refuse more.
- **Reporting** (`createCloudApi().report`): posts the burn to `/v1/transfers`.
  - A network error, a 5xx or a 429 is retried after 2, 4, 8, 16, 32 and 64
    seconds, then dropped with a warning. Any other refusal is dropped at once with
    its error code. A 401 takes a fresh token once.
  - It never throws, and an answer that does not read as a transfer is dropped.
- **The engine wrapper** (`withWhiskCloud`), tested on the real engine with the
  test harness:
  - `quote` screens the paying wallet on the source chain and the recipient on the
    destination alongside the fee lookup, so a hit leaves no quote to sign.
  - `send` reports the burn when the wallet returns its hash, once, and the mint
    when it lands. Reports run in the background and never fail or delay the
    payment. `transferFor` gives the Whisk Cloud transfer for the recovery link.
  - `resume` and `resumeFromTx` report the mint against the burn.
  - Refunds are the merchant's own sends and are neither screened nor reported.
- **Errors:** `WhiskErrorCode` gains `SCREENING_REFUSED`. `ScreeningError` is not
  exported yet.
- **Live check:** the skipped integration test now also screens and reports
  against a running platform API.
