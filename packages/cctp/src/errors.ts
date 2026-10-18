/**
 * Error hierarchy for `@usewhisk/cctp`.
 *
 * Every public function throws a `CctpError` subclass — never bare
 * `Error`. Each subclass has a stable `code` callers can switch on,
 * plus a machine-readable `name`. Human-readable detail goes in
 * `message`.
 *
 * Layers:
 *   - `InvalidInputError`  — caller passed bad data
 *   - `IrisError`          — HTTP / parse failures from Iris
 *   - `ProtocolError`      — CCTP-level invariant violated
 *   - `UnsupportedError`   — feature not in v1
 */

export type CctpErrorCode =
  // input
  | "invalid_address"
  | "invalid_bytes32"
  | "invalid_amount"
  | "invalid_chain"
  | "invalid_domain"
  | "invalid_input"
  // iris
  | "iris_http"
  | "iris_network"
  | "iris_parse"
  | "iris_aborted"
  | "iris_rate_limited"
  // protocol
  | "amount_too_large"
  | "fee_unavailable"
  | "tier_not_found"
  | "no_route"
  | "rpc_unavailable"
  // unsupported
  | "unsupported_chain"
  | "unsupported_ecosystem";

export class CctpError extends Error {
  readonly code: CctpErrorCode;
  override readonly cause?: unknown;

  constructor(code: CctpErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "CctpError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

/** Caller passed bad input. The fix is in the calling code. */
export class InvalidInputError extends CctpError {
  constructor(code: CctpErrorCode, message: string, cause?: unknown) {
    super(code, message, cause);
    this.name = "InvalidInputError";
  }
}

/** HTTP, JSON, or network failures from Iris. May be transient. */
export class IrisError extends CctpError {
  constructor(code: CctpErrorCode, message: string, cause?: unknown) {
    super(code, message, cause);
    this.name = "IrisError";
  }
}

/** HTTP non-2xx response from Iris. */
export class IrisHttpError extends IrisError {
  readonly status: number;
  readonly bodySnippet: string;
  readonly url: string;
  constructor(status: number, url: string, bodySnippet: string) {
    super(
      "iris_http",
      `Iris ${status} on ${url}: ${bodySnippet.slice(0, 200)}`,
    );
    this.name = "IrisHttpError";
    this.status = status;
    this.url = url;
    this.bodySnippet = bodySnippet;
  }
}

/**
 * Iris answered 429, which blocks every request from this IP for five
 * minutes. `retryAt` is when this process will ask again, in ms since the
 * epoch.
 */
export class IrisRateLimitedError extends IrisError {
  readonly retryAt: number;
  readonly host: string;
  constructor(host: string, retryAt: number) {
    super(
      "iris_rate_limited",
      `Iris rate limit reached on ${host}; requests resume at ${new Date(retryAt).toISOString()}`,
    );
    this.name = "IrisRateLimitedError";
    this.host = host;
    this.retryAt = retryAt;
  }
}

/** Network failure or fetch aborted. */
export class IrisNetworkError extends IrisError {
  constructor(message: string, cause?: unknown) {
    super("iris_network", message, cause);
    this.name = "IrisNetworkError";
  }
}

/** Iris returned non-JSON or unexpected JSON shape. */
export class IrisParseError extends IrisError {
  constructor(message: string, cause?: unknown) {
    super("iris_parse", message, cause);
    this.name = "IrisParseError";
  }
}

/** Caller's AbortSignal fired or per-request timeout elapsed. */
export class IrisAbortedError extends IrisError {
  constructor(message: string) {
    super("iris_aborted", message);
    this.name = "IrisAbortedError";
  }
}

/** CCTP-level invariant violated. */
export class ProtocolError extends CctpError {
  constructor(code: CctpErrorCode, message: string, cause?: unknown) {
    super(code, message, cause);
    this.name = "ProtocolError";
  }
}

/** Feature isn't in v1. */
export class UnsupportedError extends CctpError {
  constructor(code: CctpErrorCode, message: string) {
    super(code, message);
    this.name = "UnsupportedError";
  }
}

/**
 * Narrow `unknown` from a `catch` into a `CctpError`. Use only when
 * wrapping into a typed error makes sense for the caller — most code
 * should let the original error propagate.
 */
export function isCctpError(value: unknown): value is CctpError {
  return value instanceof CctpError;
}
