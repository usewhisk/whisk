import { ConfigError } from "../errors/errors.js";
import {
  METADATA_MAX_BYTES,
  METADATA_RESERVED_PREFIX,
  type WhiskMetadata,
} from "./types.js";

/**
 * Throws {@link ConfigError} on any broken rule, so the problem shows before
 * the payer signs:
 * - Object (no arrays, no primitives, no `null`).
 * - All keys are non-empty strings.
 * - No key starts with the reserved `__` prefix.
 * - All values are `string | number | boolean`.
 * - Numbers are finite (no `NaN`, no `Infinity`).
 * - Serialized JSON size <= 1 KB.
 *
 * An empty object passes.
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

  // Measured as UTF-8 bytes of the JSON, since that is what webhook
  // receivers get.
  const serialized = JSON.stringify(input);
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
 * Per-call keys override `WhiskConfig.defaultMetadata`. Returns `undefined`
 * when both are empty.
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
