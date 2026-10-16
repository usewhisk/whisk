import { ConfigError } from "../errors/errors.js";
import {
  METADATA_MAX_BYTES,
  METADATA_RESERVED_PREFIX,
  type WhiskMetadata,
} from "./types.js";

/**
 * Validate metadata at config or call time. Throws {@link ConfigError} on
 * any rule violation so the merchant sees the problem before they sign.
 *
 * Rules enforced:
 * - Object (no arrays, no primitives, no `null`).
 * - All keys are non-empty strings.
 * - No key starts with the reserved `__` prefix.
 * - All values are `string | number | boolean`.
 * - Numbers are finite (no `NaN`, no `Infinity`).
 * - Serialized JSON size <= 1 KB.
 *
 * Empty objects pass — they're a valid "no metadata" signal.
 */
export function validateMetadata(
  input: unknown,
): asserts input is WhiskMetadata {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new ConfigError(
      "metadata must be a plain object, not " +
        (input === null
          ? "null"
          : Array.isArray(input)
            ? "an array"
            : typeof input),
    );
  }

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (key.length === 0) {
      throw new ConfigError("metadata keys must be non-empty strings");
    }
    if (key.startsWith(METADATA_RESERVED_PREFIX)) {
      throw new ConfigError(
        `metadata key "${key}" uses the reserved "${METADATA_RESERVED_PREFIX}" prefix`,
      );
    }
    const t = typeof value;
    if (t !== "string" && t !== "number" && t !== "boolean") {
      throw new ConfigError(
        `metadata value for "${key}" must be string, number, or boolean (got ${t})`,
      );
    }
    if (t === "number" && !Number.isFinite(value)) {
      throw new ConfigError(
        `metadata value for "${key}" is not a finite number`,
      );
    }
  }

  // Size check on the serialized JSON, not the raw object, because the
  // serialized form is what we persist and what consumers will receive.
  const serialized = JSON.stringify(input);
  // UTF-8 byte length, not character length.
  const byteLength =
    typeof Buffer !== "undefined"
      ? Buffer.byteLength(serialized, "utf8")
      : new TextEncoder().encode(serialized).byteLength;

  if (byteLength > METADATA_MAX_BYTES) {
    throw new ConfigError(
      `metadata exceeds ${METADATA_MAX_BYTES}-byte cap (got ${byteLength} bytes serialized)`,
    );
  }
}

/**
 * Merge default metadata from `WhiskConfig` with per-call metadata.
 * Per-call keys override defaults on conflict. Returns `undefined` if both
 * are empty so the engine can skip metadata plumbing entirely.
 */
export function mergeMetadata(
  defaults: WhiskMetadata | undefined,
  perCall: WhiskMetadata | undefined,
): WhiskMetadata | undefined {
  const a = defaults ?? {};
  const b = perCall ?? {};
  const merged = { ...a, ...b };
  if (Object.keys(merged).length === 0) return undefined;
  return merged;
}
