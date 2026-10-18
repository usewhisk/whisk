/**
 * `createWhisk` — engine factory.
 *
 * The engine owns no chain knowledge — it asks `@usewhisk/cctp` to
 * build burn / mint calldata (or Solana instructions) and hands them
 * to the user-supplied adapter. Dispatch flows on the source
 * ecosystem:
 *
 *   EVM source     → `EvmAdapter`     → `executeSameChainSend` / `executeBridge`
 *   Solana source  → `SolanaAdapter`  → `executeSameChainSolanaSend` / cross-ecosystem bridge
 *
 * Cross-ecosystem bridges (EVM ↔ Solana) require two adapters and
 * arrive in S5 alongside live Devnet verification. The engine returns
 * a clean failure for those routes today.
 */

import {
  getChain,
  type CctpChain,
  type EvmChain,
  type SolanaChain,
  type StarknetChain,
  type StellarChain,
} from "@usewhisk/cctp";
import type { WhiskConfig } from "../types/config.js";
import type { ResolvedRecipient } from "../types/recipient.js";
import type { Quote } from "../types/quote.js";
import type { Chain } from "../types/chain.js";
import { ConfigError } from "../errors/errors.js";
import { addressResolver } from "../resolvers/address.js";
import { decideRoute } from "../routing/decide.js";
import { connectedEcosystems, planRoute } from "../routing/plan.js";
import { mergeMetadata, validateMetadata } from "../metadata/validate.js";
import type { WhiskMetadata } from "../metadata/types.js";
import { isBridgeRoute, isSendRoute } from "../types/route.js";
import { DEFAULT_FEE_BEARER } from "../types/fee.js";
import { parseUsdcAmount } from "./amount.js";
import { buildQuote } from "./quote.js";
import { buildBridgeQuote } from "./bridge/quote.js";
import { executeBridge } from "./bridge/execute.js";
import { executeSolanaToEvm } from "./bridge/executeSolanaToEvm.js";
import { executeEvmToSolana } from "./bridge/executeEvmToSolana.js";
import { executeEvmToStellar } from "./bridge/executeEvmToStellar.js";
import { executeStellarToEvm } from "./bridge/executeStellarToEvm.js";
import { executeSolanaToStellar } from "./bridge/executeSolanaToStellar.js";
import { executeStellarToSolana } from "./bridge/executeStellarToSolana.js";
import { executeSameChainSend } from "./send/sameChain.js";
import { executeSameChainSolanaSend } from "./send/sameChainSolana.js";
import { executeSameChainStarknetSend } from "./send/sameChainStarknet.js";
import { executeSameChainStellarSend } from "./send/sameChainStellar.js";
import { executeEvmToStarknet } from "./bridge/executeEvmToStarknet.js";
import { executeStarknetToEvm } from "./bridge/executeStarknetToEvm.js";
import { executeSolanaToStarknet } from "./bridge/executeSolanaToStarknet.js";
import { executeStarknetToSolana } from "./bridge/executeStarknetToSolana.js";
import { executeStellarToStarknet } from "./bridge/executeStellarToStarknet.js";
import { executeStarknetToStellar } from "./bridge/executeStarknetToStellar.js";
import { buildCustomFee } from "./customFee.js";
import { buildRefundMetadata, validateRefundInput } from "../refund/index.js";
import type {
  EvmAdapter,
  QuoteParams,
  RetryParams,
  RefundParams,
  RefundResult,
  SendListeners,
  SendParams,
  SendResult,
  SolanaAdapter,
  StarknetAdapter,
  StellarAdapter,
  WhiskAdapter,
  WhiskEngine,
} from "./types.js";

const RETRY_NOT_IMPLEMENTED = new ConfigError(
  "Engine retry is not implemented in this build.",
);

export function createWhisk(config: WhiskConfig): WhiskEngine {
  if (!config.chains || config.chains.length === 0) {
    throw new ConfigError("createWhisk: at least one chain is required.");
  }
  if (config.defaultMetadata !== undefined) {
    validateMetadata(config.defaultMetadata);
  }

  const resolvedConfig: WhiskConfig = {
    ...config,
    feeBearer: config.feeBearer ?? DEFAULT_FEE_BEARER,
    useForwarder: config.useForwarder ?? true,
  };
  const resolver = resolvedConfig.resolver ?? addressResolver;
  const feeBearer = resolvedConfig.feeBearer ?? DEFAULT_FEE_BEARER;
  const useForwarder = resolvedConfig.useForwarder ?? true;

  const engine: WhiskEngine = {
    config: resolvedConfig,

    async resolve(input, chain): Promise<ResolvedRecipient> {
      const trimmed = input.trim();
      if (!resolver.matches(trimmed)) {
        throw new ConfigError(`resolve: "${trimmed}" is not a valid input.`);
      }
      const result = await resolver.resolve(trimmed, { chain });
      if (!result) {
        throw new ConfigError(`resolve: could not resolve "${trimmed}".`);
      }
      return result;
    },

    async quote(params: QuoteParams): Promise<Quote> {
      const { quote } = await buildQuote(params, { config: resolvedConfig });
      return quote;
    },

    async send(
      params: SendParams,
      listeners?: SendListeners,
    ): Promise<SendResult> {
      if (params.metadata !== undefined) validateMetadata(params.metadata);
      const metadata = mergeMetadata(
        resolvedConfig.defaultMetadata,
        params.metadata,
      );
      const result = await runRoute(
        {
          sourceChain: params.sourceChain,
          destinationChain: params.destinationChain,
          recipient: params.recipient,
          amount: params.amount,
          adapter: params.adapter,
          ...(params.destinationAdapter && {
            destinationAdapter: params.destinationAdapter,
          }),
        },
        listeners,
      );
      return attachMetadata(result, metadata);
    },

    async retry(
      _params: RetryParams,
      _listeners?: SendListeners,
    ): Promise<SendResult> {
      throw RETRY_NOT_IMPLEMENTED;
    },

    async refund(
      params: RefundParams,
      listeners?: SendListeners,
    ): Promise<RefundResult> {
      const plan = validateRefundInput(params);
      const refundMetadata = buildRefundMetadata(
        plan.originalTxHash,
        plan.reason,
        mergeMetadata(resolvedConfig.defaultMetadata, plan.metadata),
      );
      const recipient: ResolvedRecipient = {
        address: plan.originalSenderAddress,
        chain: plan.refundDestinationChain,
      };
      const result = await runRoute(
        {
          sourceChain: plan.originalDestinationChain,
          destinationChain: plan.refundDestinationChain,
          recipient,
          amount: plan.amount,
          adapter: params.merchantAdapter,
          ...(params.destinationAdapter && {
            destinationAdapter: params.destinationAdapter,
          }),
        },
        listeners,
      );
      return attachMetadata(result, refundMetadata);
    },
  };

  async function runRoute(
    input: {
      sourceChain: Chain;
      destinationChain: Chain;
      recipient: ResolvedRecipient;
      amount: string;
      adapter: WhiskAdapter;
      destinationAdapter?: WhiskAdapter;
    },
    listeners?: SendListeners,
  ): Promise<SendResult> {
    const route = decideRoute(input.sourceChain, input.destinationChain);

    if (isSendRoute(route)) {
      const cctpChain = getChain(route.chain);

      if (cctpChain.ecosystem === "solana") {
        const adapter = expectSolanaAdapter(input.adapter, cctpChain);
        return executeSameChainSolanaSend(
          {
            chain: cctpChain,
            recipientAddress: input.recipient.address,
            amount: parseUsdcAmount(input.amount),
            adapter,
          },
          listeners,
        );
      }

      if (cctpChain.ecosystem === "stellar") {
        const adapter = expectStellarAdapter(input.adapter, cctpChain);
        return executeSameChainStellarSend(
          {
            chain: cctpChain,
            recipientAddress: input.recipient.address,
            amount: parseUsdcAmount(input.amount),
            adapter,
          },
          listeners,
        );
      }

      if (cctpChain.ecosystem === "starknet") {
        const adapter = expectStarknetAdapter(input.adapter, cctpChain);
        return executeSameChainStarknetSend(
          {
            chain: cctpChain,
            recipientAddress: input.recipient.address,
            amount: parseUsdcAmount(input.amount),
            adapter,
          },
          listeners,
        );
      }

      const evmSendChain = cctpChain as EvmChain;
      const adapter = expectEvmAdapter(input.adapter, evmSendChain);
      const customFee = buildCustomFee(resolvedConfig.feePolicy, evmSendChain);
      return executeSameChainSend(
        {
          chain: evmSendChain,
          recipientAddress: input.recipient.address,
          amount: parseUsdcAmount(input.amount),
          adapter,
          ...(customFee && { customFeeCalls: customFee.calls }),
        },
        listeners,
      );
    }

    if (isBridgeRoute(route)) {
      const plan = planRoute({
        source: route.sourceChain,
        destination: route.destinationChain,
        connected: connectedEcosystems(input.adapter, input.destinationAdapter),
        useForwarder,
      });
      const { source, destination, network } = plan;
      const forwarded = plan.mint.kind === "forwarder";

      const bridge = await buildBridgeQuote({
        network,
        source,
        destination,
        sourceChain: route.sourceChain,
        destinationChain: route.destinationChain,
        recipient: input.recipient,
        amount: input.amount,
        feeBearer,
        useForwarder: forwarded,
        ...(resolvedConfig.feePolicy && {
          customFee: resolvedConfig.feePolicy,
        }),
        ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
      });

      // --- EVM → EVM (the original path) -----------------------------------
      if (source.ecosystem === "evm" && destination.ecosystem === "evm") {
        const evmSource = source as EvmChain;
        const evmDestination = destination as EvmChain;
        const evmAdapter = expectEvmAdapter(input.adapter, evmSource);
        const customFee = buildCustomFee(resolvedConfig.feePolicy, evmSource);
        return executeBridge(
          {
            network,
            ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
            source: evmSource,
            destination: evmDestination,
            recipientAddress: input.recipient.address,
            burnAmount: bridge.burnAmount,
            maxFee: bridge.maxFee,
            burnFee: bridge.burnFee,
            forwarderFee: bridge.forwarderFee,
            tier: bridge.tier,
            useForwarder: forwarded,
            sourceAdapter: evmAdapter,
            ...(customFee && { customFeeCalls: customFee.calls }),
          },
          listeners,
        );
      }

      // --- Solana → EVM (Forwarder relays the mint, or the EVM wallet mints) -
      if (source.ecosystem === "solana" && destination.ecosystem === "evm") {
        const solSource = source as SolanaChain;
        const evmDestination = destination as EvmChain;
        const solanaAdapter = expectSolanaAdapter(input.adapter, solSource);
        const destAdapter =
          !forwarded && input.destinationAdapter
            ? expectEvmAdapter(input.destinationAdapter, evmDestination)
            : undefined;
        return executeSolanaToEvm(
          {
            network,
            ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
            source: solSource,
            destination: evmDestination,
            recipientAddress: input.recipient.address as `0x${string}`,
            burnAmount: bridge.burnAmount,
            maxFee: bridge.maxFee,
            burnFee: bridge.burnFee,
            forwarderFee: bridge.forwarderFee,
            tier: bridge.tier,
            useForwarder: forwarded,
            sourceAdapter: solanaAdapter,
            ...(destAdapter && { destinationAdapter: destAdapter }),
          },
          listeners,
        );
      }

      // --- EVM → Starknet (manual receive_message via destAdapter) --------
      if (source.ecosystem === "evm" && destination.ecosystem === "starknet") {
        const evmSource = source as EvmChain;
        const starknetDest = destination as StarknetChain;
        const evmAdapter = expectEvmAdapter(input.adapter, evmSource);
        if (!input.destinationAdapter) {
          throw new ConfigError(
            "EVM → Starknet bridge requires a destinationAdapter (the Starknet wallet that signs receive_message).",
          );
        }
        const destAdapter = expectStarknetAdapter(
          input.destinationAdapter,
          starknetDest,
        );
        const customFee = buildCustomFee(resolvedConfig.feePolicy, evmSource);
        return executeEvmToStarknet(
          {
            network,
            ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
            source: evmSource,
            destination: starknetDest,
            recipientAddress: input.recipient.address,
            burnAmount: bridge.burnAmount,
            maxFee: bridge.maxFee,
            burnFee: bridge.burnFee,
            forwarderFee: bridge.forwarderFee,
            tier: bridge.tier,
            sourceAdapter: evmAdapter,
            destinationAdapter: destAdapter,
            ...(customFee && { customFeeCalls: customFee.calls }),
          },
          listeners,
        );
      }

      // --- Starknet → EVM (manual receive on EVM, no Iris forward) --------
      if (source.ecosystem === "starknet" && destination.ecosystem === "evm") {
        const starknetSource = source as StarknetChain;
        const evmDestination = destination as EvmChain;
        const starknetAdapter = expectStarknetAdapter(
          input.adapter,
          starknetSource,
        );
        if (!input.destinationAdapter) {
          throw new ConfigError(
            "Starknet → EVM bridge requires a destinationAdapter (the EVM wallet that signs receiveMessage).",
          );
        }
        const destAdapter = expectEvmAdapter(
          input.destinationAdapter,
          evmDestination,
        );
        return executeStarknetToEvm(
          {
            network,
            ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
            source: starknetSource,
            destination: evmDestination,
            recipientAddress: input.recipient.address as `0x${string}`,
            burnAmount: bridge.burnAmount,
            maxFee: bridge.maxFee,
            burnFee: bridge.burnFee,
            forwarderFee: bridge.forwarderFee,
            tier: bridge.tier,
            sourceAdapter: starknetAdapter,
            destinationAdapter: destAdapter,
          },
          listeners,
        );
      }

      // --- EVM → Stellar (Stellar Forwarder mints on signed call from destAdapter) -
      if (source.ecosystem === "evm" && destination.ecosystem === "stellar") {
        const evmSource = source as EvmChain;
        const stellarDest = destination as StellarChain;
        const evmAdapter = expectEvmAdapter(input.adapter, evmSource);
        if (!input.destinationAdapter) {
          throw new ConfigError(
            "EVM → Stellar bridge requires a destinationAdapter (the Stellar wallet that signs mint_and_forward).",
          );
        }
        const destAdapter = expectStellarAdapter(
          input.destinationAdapter,
          stellarDest,
        );
        const customFee = buildCustomFee(resolvedConfig.feePolicy, evmSource);
        return executeEvmToStellar(
          {
            network,
            ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
            source: evmSource,
            destination: stellarDest,
            recipientAddress: input.recipient.address,
            burnAmount: bridge.burnAmount,
            maxFee: bridge.maxFee,
            burnFee: bridge.burnFee,
            forwarderFee: bridge.forwarderFee,
            tier: bridge.tier,
            sourceAdapter: evmAdapter,
            destinationAdapter: destAdapter,
            ...(customFee && { customFeeCalls: customFee.calls }),
          },
          listeners,
        );
      }

      // --- Stellar → EVM (manual receiveMessage via destAdapter) -----------
      // Iris's auto-forwarder doesn't relay Stellar-source burns, so the
      // destination EVM wallet must sign receiveMessage manually.
      if (source.ecosystem === "stellar" && destination.ecosystem === "evm") {
        const stellarSource = source as StellarChain;
        const evmDestination = destination as EvmChain;
        const stellarAdapter = expectStellarAdapter(
          input.adapter,
          stellarSource,
        );
        if (!input.destinationAdapter) {
          throw new ConfigError(
            "Stellar → EVM bridge requires a destinationAdapter (the EVM wallet that signs receiveMessage).",
          );
        }
        const destAdapter = expectEvmAdapter(
          input.destinationAdapter,
          evmDestination,
        );
        return executeStellarToEvm(
          {
            network,
            ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
            source: stellarSource,
            destination: evmDestination,
            recipientAddress: input.recipient.address as `0x${string}`,
            burnAmount: bridge.burnAmount,
            maxFee: bridge.maxFee,
            burnFee: bridge.burnFee,
            forwarderFee: bridge.forwarderFee,
            tier: bridge.tier,
            sourceAdapter: stellarAdapter,
            destinationAdapter: destAdapter,
          },
          listeners,
        );
      }

      // --- Solana → Starknet ----------------------------------------------
      if (
        source.ecosystem === "solana" &&
        destination.ecosystem === "starknet"
      ) {
        const solSource = source as SolanaChain;
        const starknetDest = destination as StarknetChain;
        const solanaAdapter = expectSolanaAdapter(input.adapter, solSource);
        if (!input.destinationAdapter) {
          throw new ConfigError(
            "Solana → Starknet bridge requires a destinationAdapter (Starknet wallet).",
          );
        }
        const destAdapter = expectStarknetAdapter(
          input.destinationAdapter,
          starknetDest,
        );
        return executeSolanaToStarknet(
          {
            network,
            ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
            source: solSource,
            destination: starknetDest,
            recipientAddress: input.recipient.address,
            burnAmount: bridge.burnAmount,
            maxFee: bridge.maxFee,
            burnFee: bridge.burnFee,
            forwarderFee: bridge.forwarderFee,
            tier: bridge.tier,
            sourceAdapter: solanaAdapter,
            destinationAdapter: destAdapter,
          },
          listeners,
        );
      }

      // --- Starknet → Solana ----------------------------------------------
      if (
        source.ecosystem === "starknet" &&
        destination.ecosystem === "solana"
      ) {
        const starknetSource = source as StarknetChain;
        const solDestination = destination as SolanaChain;
        const starknetAdapter = expectStarknetAdapter(
          input.adapter,
          starknetSource,
        );
        if (!input.destinationAdapter) {
          throw new ConfigError(
            "Starknet → Solana bridge requires a destinationAdapter (Solana wallet).",
          );
        }
        const destAdapter = expectSolanaAdapter(
          input.destinationAdapter,
          solDestination,
        );
        return executeStarknetToSolana(
          {
            network,
            ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
            source: starknetSource,
            destination: solDestination,
            recipientAddress: input.recipient.address,
            burnAmount: bridge.burnAmount,
            maxFee: bridge.maxFee,
            burnFee: bridge.burnFee,
            forwarderFee: bridge.forwarderFee,
            tier: bridge.tier,
            sourceAdapter: starknetAdapter,
            destinationAdapter: destAdapter,
          },
          listeners,
        );
      }

      // --- Stellar → Starknet ---------------------------------------------
      if (
        source.ecosystem === "stellar" &&
        destination.ecosystem === "starknet"
      ) {
        const stellarSource = source as StellarChain;
        const starknetDest = destination as StarknetChain;
        const stellarAdapter = expectStellarAdapter(
          input.adapter,
          stellarSource,
        );
        if (!input.destinationAdapter) {
          throw new ConfigError(
            "Stellar → Starknet bridge requires a destinationAdapter (Starknet wallet).",
          );
        }
        const destAdapter = expectStarknetAdapter(
          input.destinationAdapter,
          starknetDest,
        );
        return executeStellarToStarknet(
          {
            network,
            ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
            source: stellarSource,
            destination: starknetDest,
            recipientAddress: input.recipient.address,
            burnAmount: bridge.burnAmount,
            maxFee: bridge.maxFee,
            burnFee: bridge.burnFee,
            forwarderFee: bridge.forwarderFee,
            tier: bridge.tier,
            sourceAdapter: stellarAdapter,
            destinationAdapter: destAdapter,
          },
          listeners,
        );
      }

      // --- Starknet → Stellar ---------------------------------------------
      if (
        source.ecosystem === "starknet" &&
        destination.ecosystem === "stellar"
      ) {
        const starknetSource = source as StarknetChain;
        const stellarDest = destination as StellarChain;
        const starknetAdapter = expectStarknetAdapter(
          input.adapter,
          starknetSource,
        );
        if (!input.destinationAdapter) {
          throw new ConfigError(
            "Starknet → Stellar bridge requires a destinationAdapter (Stellar wallet).",
          );
        }
        const destAdapter = expectStellarAdapter(
          input.destinationAdapter,
          stellarDest,
        );
        return executeStarknetToStellar(
          {
            network,
            ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
            source: starknetSource,
            destination: stellarDest,
            recipientAddress: input.recipient.address,
            burnAmount: bridge.burnAmount,
            maxFee: bridge.maxFee,
            burnFee: bridge.burnFee,
            forwarderFee: bridge.forwarderFee,
            tier: bridge.tier,
            sourceAdapter: starknetAdapter,
            destinationAdapter: destAdapter,
          },
          listeners,
        );
      }

      // --- Solana → Stellar (Stellar Forwarder mints) ----------------------
      if (
        source.ecosystem === "solana" &&
        destination.ecosystem === "stellar"
      ) {
        const solSource = source as SolanaChain;
        const stellarDest = destination as StellarChain;
        const solanaAdapter = expectSolanaAdapter(input.adapter, solSource);
        if (!input.destinationAdapter) {
          throw new ConfigError(
            "Solana → Stellar bridge requires a destinationAdapter (the Stellar wallet that signs mint_and_forward).",
          );
        }
        const destAdapter = expectStellarAdapter(
          input.destinationAdapter,
          stellarDest,
        );
        return executeSolanaToStellar(
          {
            network,
            ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
            source: solSource,
            destination: stellarDest,
            recipientAddress: input.recipient.address,
            burnAmount: bridge.burnAmount,
            maxFee: bridge.maxFee,
            burnFee: bridge.burnFee,
            forwarderFee: bridge.forwarderFee,
            tier: bridge.tier,
            sourceAdapter: solanaAdapter,
            destinationAdapter: destAdapter,
          },
          listeners,
        );
      }

      // --- Stellar → Solana (Solana receive_message via destAdapter) -------
      if (
        source.ecosystem === "stellar" &&
        destination.ecosystem === "solana"
      ) {
        const stellarSource = source as StellarChain;
        const solDestination = destination as SolanaChain;
        const stellarAdapter = expectStellarAdapter(
          input.adapter,
          stellarSource,
        );
        if (!input.destinationAdapter) {
          throw new ConfigError(
            "Stellar → Solana bridge requires a destinationAdapter (the Solana wallet that signs receive_message).",
          );
        }
        const destAdapter = expectSolanaAdapter(
          input.destinationAdapter,
          solDestination,
        );
        return executeStellarToSolana(
          {
            network,
            ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
            source: stellarSource,
            destination: solDestination,
            recipientAddress: input.recipient.address,
            burnAmount: bridge.burnAmount,
            maxFee: bridge.maxFee,
            burnFee: bridge.burnFee,
            forwarderFee: bridge.forwarderFee,
            tier: bridge.tier,
            sourceAdapter: stellarAdapter,
            destinationAdapter: destAdapter,
          },
          listeners,
        );
      }

      // --- EVM → Solana (manual mint on Solana — needs destinationAdapter) -
      if (source.ecosystem === "evm" && destination.ecosystem === "solana") {
        const evmSource = source as EvmChain;
        const solDestination = destination as SolanaChain;
        const evmAdapter = expectEvmAdapter(input.adapter, evmSource);
        if (!input.destinationAdapter) {
          throw new ConfigError(
            "EVM → Solana bridge requires a destinationAdapter (the Solana wallet that signs receive_message).",
          );
        }
        const destAdapter = expectSolanaAdapter(
          input.destinationAdapter,
          solDestination,
        );
        const customFee = buildCustomFee(resolvedConfig.feePolicy, evmSource);
        return executeEvmToSolana(
          {
            network,
            ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
            source: evmSource,
            destination: solDestination,
            recipientAddress: input.recipient.address,
            burnAmount: bridge.burnAmount,
            maxFee: bridge.maxFee,
            burnFee: bridge.burnFee,
            forwarderFee: bridge.forwarderFee,
            tier: bridge.tier,
            sourceAdapter: evmAdapter,
            destinationAdapter: destAdapter,
            ...(customFee && { customFeeCalls: customFee.calls }),
          },
          listeners,
        );
      }

      throw new ConfigError(
        `Unsupported bridge route: ${source.ecosystem} → ${destination.ecosystem}.`,
      );
    }

    throw new ConfigError("Unsupported route kind.");
  }

  return engine;
}

function expectEvmAdapter(adapter: WhiskAdapter, chain: CctpChain): EvmAdapter {
  if (adapter.kind !== "evm") {
    throw new ConfigError(
      `Adapter kind "${adapter.kind}" doesn't match chain "${chain.id}" (ecosystem=evm). Connect an EVM wallet.`,
    );
  }
  return adapter;
}

function expectSolanaAdapter(
  adapter: WhiskAdapter,
  chain: SolanaChain,
): SolanaAdapter {
  if (adapter.kind !== "solana") {
    throw new ConfigError(
      `Adapter kind "${adapter.kind}" doesn't match chain "${chain.id}" (ecosystem=solana). Connect a Solana wallet.`,
    );
  }
  return adapter;
}

function expectStellarAdapter(
  adapter: WhiskAdapter,
  chain: StellarChain,
): StellarAdapter {
  if (adapter.kind !== "stellar") {
    throw new ConfigError(
      `Adapter kind "${adapter.kind}" doesn't match chain "${chain.id}" (ecosystem=stellar). Connect a Stellar wallet.`,
    );
  }
  return adapter;
}

function expectStarknetAdapter(
  adapter: WhiskAdapter,
  chain: StarknetChain,
): StarknetAdapter {
  if (adapter.kind !== "starknet") {
    throw new ConfigError(
      `Adapter kind "${adapter.kind}" doesn't match chain "${chain.id}" (ecosystem=starknet). Connect a Starknet wallet.`,
    );
  }
  return adapter;
}

/**
 * Stamp the merged metadata onto a `SendResult`. Both success and
 * failure carry it through so receipts and webhook deliveries can
 * correlate either outcome back to the same request.
 */
function attachMetadata(
  result: SendResult,
  metadata: WhiskMetadata | undefined,
): SendResult {
  if (!metadata || Object.keys(metadata).length === 0) return result;
  return { ...result, metadata };
}

export type { Chain };
