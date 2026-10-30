import { isChainId } from "@usewhisk/cctp";
import type { Chain } from "../types/index.js";

/** What remote config may say, after parsing. There is no field that can move funds. */
export interface RemoteConfig {
  disabledChains: Chain[];
  disabledRoutes: { from: Chain; to: Chain }[];
  defaultSourceChain: Chain | undefined;
  defaultDestinationChain: Chain | undefined;
  pause: { message: string } | null;
  branding: { name?: string; accent?: string };
}

export interface ParsedRemoteConfig {
  config: RemoteConfig;
  /** Fields left out because they are unknown or malformed, for a development warning. */
  ignored: string[];
}

const KNOWN = new Set([
  "schema",
  "disabledChains",
  "disabledRoutes",
  "defaultSourceChain",
  "defaultDestinationChain",
  "pause",
  "branding",
]);
const ACCENT = /^#[0-9a-f]{6}$/i;
// Matches the platform's rule, so a message it refuses never shows here either.
const UNSEEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function chainOrUndefined(value: unknown): Chain | undefined {
  return typeof value === "string" && isChainId(value) ? value : undefined;
}

function shortText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text.length === 0 || text.length > max || UNSEEN.test(text)) {
    return undefined;
  }
  return text;
}

/**
 * Reads a version 1 config from a verified token. Anything unknown or
 * malformed is left out rather than guessed at: leaving out a field can only
 * leave the integrator's own config in force. A newer schema is ignored whole.
 */
export function parseRemoteConfig(
  value: unknown,
): ParsedRemoteConfig | undefined {
  if (!isRecord(value) || value.schema !== 1) return undefined;
  const ignored = Object.keys(value).filter((key) => !KNOWN.has(key));

  let disabledChains: Chain[] = [];
  if (Array.isArray(value.disabledChains)) {
    disabledChains = value.disabledChains.flatMap((c) => {
      const chain = chainOrUndefined(c);
      return chain ? [chain] : [];
    });
  } else if (value.disabledChains !== undefined) {
    ignored.push("disabledChains");
  }

  let disabledRoutes: RemoteConfig["disabledRoutes"] = [];
  if (Array.isArray(value.disabledRoutes)) {
    disabledRoutes = value.disabledRoutes.flatMap((route) => {
      if (!isRecord(route)) return [];
      const from = chainOrUndefined(route.from);
      const to = chainOrUndefined(route.to);
      return from && to ? [{ from, to }] : [];
    });
  } else if (value.disabledRoutes !== undefined) {
    ignored.push("disabledRoutes");
  }

  let pause: RemoteConfig["pause"] = null;
  if (isRecord(value.pause)) {
    const message = shortText(value.pause.message, 140);
    if (message) pause = { message };
    else ignored.push("pause");
  } else if (value.pause !== null && value.pause !== undefined) {
    ignored.push("pause");
  }

  const branding: RemoteConfig["branding"] = {};
  if (isRecord(value.branding)) {
    const { name, accent } = value.branding;
    if (name !== null && name !== undefined) {
      const text = shortText(name, 40);
      if (text) branding.name = text;
      else ignored.push("branding.name");
    }
    if (accent !== null && accent !== undefined) {
      if (typeof accent === "string" && ACCENT.test(accent)) {
        branding.accent = accent.toLowerCase();
      } else {
        ignored.push("branding.accent");
      }
    }
  }

  return {
    config: {
      disabledChains,
      disabledRoutes,
      defaultSourceChain: chainOrUndefined(value.defaultSourceChain),
      defaultDestinationChain: chainOrUndefined(value.defaultDestinationChain),
      pause,
      branding,
    },
    ignored,
  };
}

export interface LocalChoice {
  chains: Chain[];
  defaultSourceChain?: Chain | undefined;
  defaultDestinationChain?: Chain | undefined;
}

export interface NarrowedConfig {
  chains: Chain[];
  isRouteAllowed(from: Chain, to: Chain): boolean;
  defaultSourceChain: Chain | undefined;
  defaultDestinationChain: Chain | undefined;
  pause: { message: string } | null;
  branding: { name?: string; accent?: string };
}

/**
 * Remote config can only narrow what the integrator's code allows (ADR 6.6):
 * it removes chains and routes, picks defaults among the chains still
 * enabled, pauses, and brands. It cannot add a chain, and it has no way to
 * name a recipient or a fee.
 */
export function narrowConfig(
  local: LocalChoice,
  remote: RemoteConfig,
): NarrowedConfig {
  const disabled = new Set(remote.disabledChains);
  const chains = local.chains.filter((chain) => !disabled.has(chain));
  const enabled = new Set(chains);
  const blockedRoutes = new Set(
    remote.disabledRoutes.map((r) => `${r.from}>${r.to}`),
  );
  const pick = (remoteDefault?: Chain, localDefault?: Chain) =>
    remoteDefault && enabled.has(remoteDefault)
      ? remoteDefault
      : localDefault && enabled.has(localDefault)
        ? localDefault
        : undefined;
  return {
    chains,
    isRouteAllowed: (from, to) =>
      enabled.has(from) &&
      enabled.has(to) &&
      !blockedRoutes.has(`${from}>${to}`),
    defaultSourceChain: pick(
      remote.defaultSourceChain,
      local.defaultSourceChain,
    ),
    defaultDestinationChain: pick(
      remote.defaultDestinationChain,
      local.defaultDestinationChain,
    ),
    pause: remote.pause,
    branding: { ...remote.branding },
  };
}
