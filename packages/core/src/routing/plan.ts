import {
  attestationSeconds,
  getChain,
  type CctpChain,
  type Ecosystem,
  type SecondsRange,
  type TransferSpeed,
} from "@usewhisk/cctp";
import type { Chain, ChainNetwork } from "../types/chain.js";
import {
  NetworkMismatchError,
  RouteUnavailableError,
} from "../errors/errors.js";

export type RouteMint =
  | { kind: "forwarder" }
  | { kind: "adapter"; ecosystem: Ecosystem };

export interface RoutePlan {
  source: CctpChain;
  destination: CctpChain;
  network: ChainNetwork;
  /** Standard where the source has no Fast Transfer. */
  speed: TransferSpeed;
  mint: RouteMint;
  requiredAdapters: readonly Ecosystem[];
  /** Circle's attestation time for the source. The mint adds a few seconds. */
  etaSeconds: SecondsRange;
}

export type PlanRouteInput = {
  source: Chain;
  destination: Chain;
  /** Ecosystems with a wallet connected. Leave out to skip the wallet check. */
  connected?: readonly Ecosystem[];
  useForwarder: boolean;
};

// Circle relays the mint only for burns from these sources. Stellar and
// Starknet burns reach Iris without a forwarding state.
const FORWARDING_SOURCES: readonly Ecosystem[] = ["evm", "solana"];

export function planRoute(input: PlanRouteInput): RoutePlan {
  const source = getChain(input.source);
  const destination = getChain(input.destination);

  if (source.id === destination.id) {
    throw new RouteUnavailableError(
      "same_chain",
      `${source.label} is both the source and the destination. Use a same-chain send.`,
    );
  }
  if (source.network !== destination.network) {
    throw new NetworkMismatchError(source.label, destination.label);
  }
  const speed: TransferSpeed = source.capabilities.fastSource
    ? "fast"
    : "standard";

  const forwarded =
    input.useForwarder &&
    destination.ecosystem === "evm" &&
    destination.capabilities.forwardingDestination &&
    FORWARDING_SOURCES.includes(source.ecosystem);
  const mint: RouteMint = forwarded
    ? { kind: "forwarder" }
    : { kind: "adapter", ecosystem: destination.ecosystem };

  const requiredAdapters: Ecosystem[] = [source.ecosystem];
  if (mint.kind === "adapter" && mint.ecosystem !== source.ecosystem) {
    requiredAdapters.push(mint.ecosystem);
  }

  if (input.connected) {
    if (!input.connected.includes(source.ecosystem)) {
      throw new RouteUnavailableError(
        "source_adapter_required",
        `Connect a ${walletName(source.ecosystem)} wallet to send from ${source.label}.`,
        source.ecosystem,
      );
    }
    const missing = requiredAdapters.find((e) => !input.connected?.includes(e));
    if (missing) {
      throw new RouteUnavailableError(
        "destination_adapter_required",
        `Connect a ${walletName(missing)} wallet to finish the transfer on ${destination.label}.`,
        missing,
      );
    }
  }

  return {
    source,
    destination,
    network: source.network,
    speed,
    mint,
    requiredAdapters,
    etaSeconds: attestationSeconds(source, speed),
  };
}

export function connectedEcosystems(
  ...adapters: readonly ({ kind: Ecosystem } | undefined)[]
): Ecosystem[] {
  const out: Ecosystem[] = [];
  for (const adapter of adapters) {
    if (adapter && !out.includes(adapter.kind)) out.push(adapter.kind);
  }
  return out;
}

function walletName(ecosystem: Ecosystem): string {
  switch (ecosystem) {
    case "evm":
      return "EVM";
    case "solana":
      return "Solana";
    case "stellar":
      return "Stellar";
    case "starknet":
      return "Starknet";
  }
}
