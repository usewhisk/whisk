import type { StepName } from "../types/step.js";

export type WhiskErrorCode =
  | "NO_ADAPTER"
  | "WRONG_CHAIN"
  | "INSUFFICIENT_BALANCE"
  | "INVALID_ADDRESS"
  | "RESOLVER_FAILED"
  | "BRIDGE_STEP_FAILED"
  | "USER_REJECTED"
  | "NETWORK_ERROR"
  | "WALLET_CAPABILITY"
  | "ONCHAIN_REVERT"
  | "CONFIG_ERROR"
  | "NETWORK_MISMATCH"
  | "ROUTE_UNAVAILABLE"
  | "UNKNOWN";

/** Mirrored from App Kit's `BridgeStepErrorCategory` (App Kit 1.4.2+). */
export type WhiskErrorCategory =
  | "user_rejected"
  | "atomic_unsupported"
  | "batch_too_large"
  | "duplicate_batch_id"
  | "unknown_bundle"
  | "polling_timeout"
  | "failed_offchain"
  | "reverted_onchain"
  | "partial_reverted"
  | "chain_revert"
  | "unknown";

export interface WhiskErrorOptions {
  code: WhiskErrorCode;
  message: string;
  retryable?: boolean;
  step?: StepName;
  category?: WhiskErrorCategory;
  cause?: unknown;
}

export class WhiskError extends Error {
  readonly code: WhiskErrorCode;
  readonly retryable: boolean;
  readonly step?: StepName;
  readonly category?: WhiskErrorCategory;
  override readonly cause?: unknown;

  constructor(opts: WhiskErrorOptions) {
    super(opts.message);
    this.name = "WhiskError";
    this.code = opts.code;
    this.retryable = opts.retryable ?? false;
    this.step = opts.step;
    this.category = opts.category;
    this.cause = opts.cause;
    // Maintain prototype chain for `instanceof` after transpilation.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NoAdapterError extends WhiskError {
  constructor(message = "No wallet adapter connected.", cause?: unknown) {
    super({ code: "NO_ADAPTER", message, retryable: false, cause });
    this.name = "NoAdapterError";
  }
}

export class WrongChainError extends WhiskError {
  constructor(
    public readonly expectedChain: string,
    cause?: unknown,
  ) {
    super({
      code: "WRONG_CHAIN",
      message: `Connected wallet is on the wrong chain. Expected: ${expectedChain}.`,
      retryable: true,
      cause,
    });
    this.name = "WrongChainError";
  }
}

export class InsufficientBalanceError extends WhiskError {
  constructor(
    public readonly required: string,
    public readonly available: string,
    public readonly token: string,
    cause?: unknown,
  ) {
    super({
      code: "INSUFFICIENT_BALANCE",
      message: `Insufficient ${token}. Need ${required}, have ${available}.`,
      retryable: false,
      cause,
    });
    this.name = "InsufficientBalanceError";
  }
}

export class InvalidAddressError extends WhiskError {
  constructor(
    public readonly input: string,
    cause?: unknown,
  ) {
    super({
      code: "INVALID_ADDRESS",
      message: `"${input}" is not a recognised address or supported recipient format.`,
      retryable: false,
      cause,
    });
    this.name = "InvalidAddressError";
  }
}

export class ResolverError extends WhiskError {
  constructor(
    public readonly resolverName: string,
    message: string,
    cause?: unknown,
  ) {
    super({
      code: "RESOLVER_FAILED",
      message: `${resolverName} resolver failed: ${message}`,
      retryable: true,
      cause,
    });
    this.name = "ResolverError";
  }
}

export class BridgeStepError extends WhiskError {
  constructor(
    step: StepName,
    message: string,
    opts: { retryable?: boolean; cause?: unknown } = {},
  ) {
    super({
      code: "BRIDGE_STEP_FAILED",
      message: `Bridge step "${step}" failed: ${message}`,
      step,
      retryable: opts.retryable ?? true,
      cause: opts.cause,
    });
    this.name = "BridgeStepError";
  }
}

export class UserRejectedError extends WhiskError {
  constructor(message = "User rejected the request.", cause?: unknown) {
    super({
      code: "USER_REJECTED",
      message,
      retryable: true,
      category: "user_rejected",
      cause,
    });
    this.name = "UserRejectedError";
  }
}

export class NetworkError extends WhiskError {
  constructor(message: string, cause?: unknown, category?: WhiskErrorCategory) {
    super({
      code: "NETWORK_ERROR",
      message,
      retryable: true,
      category,
      cause,
    });
    this.name = "NetworkError";
  }
}

export class WalletCapabilityError extends WhiskError {
  constructor(
    category:
      | "atomic_unsupported"
      | "batch_too_large"
      | "duplicate_batch_id"
      | "unknown_bundle"
      | "polling_timeout",
    message: string,
    cause?: unknown,
  ) {
    super({
      code: "WALLET_CAPABILITY",
      message,
      retryable: false,
      category,
      cause,
    });
    this.name = "WalletCapabilityError";
  }
}

export class OnchainRevertError extends WhiskError {
  constructor(
    category: "reverted_onchain" | "partial_reverted" | "chain_revert",
    message: string,
    cause?: unknown,
    step?: StepName,
  ) {
    super({
      code: "ONCHAIN_REVERT",
      message,
      retryable: false,
      category,
      step,
      cause,
    });
    this.name = "OnchainRevertError";
  }
}

export class ConfigError extends WhiskError {
  constructor(message: string, cause?: unknown) {
    super({
      code: "CONFIG_ERROR",
      message,
      retryable: false,
      cause,
    });
    this.name = "ConfigError";
  }
}

export class NetworkMismatchError extends WhiskError {
  constructor(
    public readonly source: string,
    public readonly destination: string,
  ) {
    super({
      code: "NETWORK_MISMATCH",
      message: `${source} and ${destination} are on different networks. Pick a mainnet chain for both, or a testnet chain for both.`,
      retryable: false,
    });
    this.name = "NetworkMismatchError";
  }
}

export type RouteUnavailableReason =
  | "same_chain"
  | "standard_only_source"
  | "source_adapter_required"
  | "destination_adapter_required";

export class RouteUnavailableError extends WhiskError {
  constructor(
    public readonly reason: RouteUnavailableReason,
    message: string,
    public readonly ecosystem?: string,
  ) {
    super({ code: "ROUTE_UNAVAILABLE", message, retryable: false });
    this.name = "RouteUnavailableError";
  }
}

const TRANSIENT_PATTERNS =
  /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|socket hang up|network error|fetch failed|status code 5\d{2}/i;

const REJECTION_PATTERNS = /user rejected|user denied|rejected by user/i;

/** Shown when the user declines the wallet prompt. The raw provider error
 *  (the full viem/App Kit dump) is kept on `cause` for debugging. */
const REJECTION_MESSAGE = "You cancelled the transaction in your wallet.";

/**
 * App Kit's Swap (RFQ liquidity) and routing report this when no quote exists
 * for the requested pair, direction, or size — common on testnet, where
 * liquidity is sparse and often one-directional.
 */
const NO_ROUTE_PATTERNS =
  /no route|route or resource not found|route not found/i;
const NO_ROUTE_MESSAGE =
  "No quote available for this pair right now. Try again in a moment or use a different amount.";

/**
 * viem and App Kit errors append a verbose dump to a short first line
 * ("Request Arguments: …", "Details: …", "Version: viem@x"). Surface only the
 * human part: the first line, minus App Kit's "Unknown blockchain error on
 * <chain>:" wrapper and any inline argument dump. The full text stays on
 * `cause`, so nothing is lost for debugging.
 */
export function cleanErrorMessage(message: string): string {
  // Plain string scans only (indexOf/startsWith/slice) — no regex, so there's
  // no backtracking to make this superlinear on adversarial input.

  // First line only — the human part sits up front.
  const newline = message.indexOf("\n");
  let line = newline === -1 ? message : message.slice(0, newline);

  // Drop viem's "Request Arguments: …" tail.
  const argsAt = line.toLowerCase().indexOf("request arguments:");
  if (argsAt !== -1) line = line.slice(0, argsAt);

  // Strip App Kit's "Unknown blockchain error on <chain>: " wrapper.
  const prefix = "unknown blockchain error on ";
  if (line.toLowerCase().startsWith(prefix)) {
    const colon = line.indexOf(":", prefix.length);
    if (colon !== -1) line = line.slice(colon + 1);
  }

  return line.trim() || message.trim();
}

/** Coerce an unknown thrown value into a `WhiskError`. Prefer `category` over heuristic message matching. */
export function toWhiskError(
  err: unknown,
  fallbackMessage = "Unknown error",
  category?: WhiskErrorCategory,
): WhiskError {
  if (err instanceof WhiskError) return err;

  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : fallbackMessage;

  if (category) {
    switch (category) {
      case "user_rejected":
        return new UserRejectedError(REJECTION_MESSAGE, err);
      case "failed_offchain":
        return new NetworkError(cleanErrorMessage(message), err, category);
      case "polling_timeout":
      case "atomic_unsupported":
      case "batch_too_large":
      case "duplicate_batch_id":
      case "unknown_bundle":
        return new WalletCapabilityError(
          category,
          cleanErrorMessage(message),
          err,
        );
      case "reverted_onchain":
      case "partial_reverted":
      case "chain_revert":
        return new OnchainRevertError(
          category,
          cleanErrorMessage(message),
          err,
        );
      case "unknown":
        break;
    }
  }

  if (REJECTION_PATTERNS.test(message)) {
    return new UserRejectedError(REJECTION_MESSAGE, err);
  }
  if (NO_ROUTE_PATTERNS.test(message)) {
    return new WhiskError({
      code: "UNKNOWN",
      message: NO_ROUTE_MESSAGE,
      retryable: false,
      cause: err,
    });
  }
  if (TRANSIENT_PATTERNS.test(message)) {
    return new NetworkError(cleanErrorMessage(message), err);
  }
  return new WhiskError({
    code: "UNKNOWN",
    message: cleanErrorMessage(message),
    retryable: false,
    cause: err,
  });
}
