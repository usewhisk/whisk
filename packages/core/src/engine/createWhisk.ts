/**
 * The engine owns no chain knowledge. It asks `@usewhisk/cctp` for the burn
 * and mint calls and hands them to the caller's adapters to sign. `send`
 * picks an executor from the source and destination ecosystems (EVM, Solana,
 * Stellar, Starknet). A route whose mint Circle does not forward needs a
 * `destinationAdapter` for the destination wallet.
 */

import {
  getBlockNumber,
  getChain,
  getSignedBurnQuote,
  getUsdcBalance,
  type CctpChain,
  type SignedQuoteExpiry,
  type UpfrontFeeType,
  type EvmChain,
  type SolanaChain,
  type StarknetChain,
  type StellarChain,
} from "@usewhisk/cctp";
import type { WhiskConfig } from "../types/config.js";
import type { ResolvedRecipient } from "../types/recipient.js";
import type { Quote } from "../types/quote.js";
import type { Chain } from "../types/chain.js";
import {
  ConfigError,
  InsufficientBalanceError,
  QuoteChangedError,
  QuoteExpiredError,
} from "../errors/errors.js";
import { addressResolver } from "../resolvers/address.js";
import { decideRoute } from "../routing/decide.js";
import {
  connectedEcosystems,
  planRoute,
  type RoutePlan,
} from "../routing/plan.js";
import { mergeMetadata, validateMetadata } from "../metadata/validate.js";
import type { WhiskMetadata } from "../metadata/types.js";
import { isBridgeRoute, isSendRoute } from "../types/route.js";
import { DEFAULT_FEE_BEARER } from "../types/fee.js";
import { formatUsdcAmount } from "./amount.js";
import { fitFastAllowance } from "../routing/allowance.js";
import type { UpfrontFee } from "./bridge/upfront.js";
import {
  gasReserve,
  withChainRules,
  type ChainRulesContext,
} from "./chainRules.js";
import { createMemoryInflightStore } from "../inflight/stores.js";
import type { InflightRecord } from "../inflight/types.js";
import { recordFromTx, resumeTransfer, type ResumeContext } from "./resume.js";
import { buildQuote, rpcUrlsFor } from "./quote.js";
import { computeBridgeFees, fetchFeeTier } from "./bridge/quote.js";
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
import {
  buildCustomFee,
  createFeeCharge,
  type FeeCharge,
} from "./customFee.js";
import { buildRefundMetadata, validateRefundInput } from "../refund/index.js";
import type {
  CustomFeeOutcome,
  EvmAdapter,
  QuoteParams,
  RefundParams,
  RefundResult,
  SendListeners,
  SendParams,
  SendResult,
  SolanaAdapter,
  StarknetAdapter,
  StellarAdapter,
  WhiskAdapter,
  ResumeOptions,
  WhiskEngine,
} from "./types.js";

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
  const store = resolvedConfig.inflightStore ?? createMemoryInflightStore();
  const resumeContext: ResumeContext = {
    store,
    ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
    rpcUrls: (chain) => rpcUrlsFor(resolvedConfig, chain),
  };
  const useForwarder = resolvedConfig.useForwarder ?? true;
  const chainRules: ChainRulesContext = {
    ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
    rpcUrls: (chain) => rpcUrlsFor(resolvedConfig, chain),
  };
  function ruled<A extends WhiskAdapter | undefined>(adapter: A): A {
    return (
      adapter?.kind === "evm" ? withChainRules(adapter, chainRules) : adapter
    ) as A;
  }
  function ruledOptions(options: ResumeOptions): ResumeOptions {
    return options.destinationAdapter
      ? { ...options, destinationAdapter: ruled(options.destinationAdapter) }
      : options;
  }

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
      if (Date.now() > params.quote.expiresAt) {
        throw new QuoteExpiredError(params.quote);
      }
      await assertCanPay(params.quote, params.adapter);
      const result = await tracked(params.quote, listeners, (tracking, fee) =>
        runRoute(
          {
            quote: params.quote,
            adapter: params.adapter,
            ...(params.destinationAdapter && {
              destinationAdapter: params.destinationAdapter,
            }),
          },
          tracking,
          fee,
        ),
      );
      return attachMetadata(result, metadata);
    },

    async balance({ chain, address }) {
      const source = getChain(chain);
      if (source.ecosystem !== "evm") return null;
      const rpcUrls = rpcUrlsFor(resolvedConfig, chain);
      return getUsdcBalance(source, address as `0x${string}`, {
        ...(rpcUrls && { rpcUrls }),
        ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
      });
    },

    async maxSendable(params) {
      if (params.adapter.kind !== "evm") return null;
      const balance = await engine.balance({
        chain: params.sourceChain,
        address: params.adapter.address,
      });
      if (balance === null) return null;
      const reserve = await gasReserve(
        getChain(params.sourceChain),
        params.sourceChain === params.destinationChain ? "send" : "bridge",
        chainRules,
      );
      const available = balance - reserve;
      const none = { amount: "0", balance, gasReserve: reserve };
      if (available <= 0n) return none;
      // Fees grow with the amount, so quote, move the amount by however much
      // the total misses the available USDC, and keep the largest that fits.
      let amount = available;
      let best = 0n;
      for (let i = 0; i < 6 && amount > 0n; i++) {
        const { quote } = await buildQuote(
          { ...params, amount: formatUsdcAmount(amount) },
          { config: resolvedConfig, skipRecipientChecks: true },
        );
        const left = available - quote.subunits.amountIn;
        if (left >= 0n && amount > best) best = amount;
        if (left === 0n) break;
        amount += left;
      }
      return best > 0n
        ? { amount: formatUsdcAmount(best), balance, gasReserve: reserve }
        : none;
    },

    inflight() {
      return store.list();
    },

    dismiss(id) {
      return store.remove(id);
    },

    async resume(record, options = {}, listeners) {
      const result = await resumeTransfer(
        record,
        ruledOptions(options),
        resumeContext,
        listeners,
      );
      return withRecordedFee(result, record);
    },

    async resumeFromTx(params, listeners) {
      const known = (await store.list()).find(
        (r) =>
          r.sourceChain === params.sourceChain &&
          r.sourceTxHash?.toLowerCase() === params.txHash.toLowerCase(),
      );
      const record =
        known ??
        (await recordFromTx(
          params.sourceChain,
          params.txHash,
          resolvedConfig.fetch,
        ));
      if (!known) await store.put(record);
      const result = await resumeTransfer(
        record,
        ruledOptions({
          ...(params.destinationAdapter && {
            destinationAdapter: params.destinationAdapter,
          }),
        }),
        resumeContext,
        listeners,
      );
      return withRecordedFee(result, record);
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
      const adapters = {
        adapter: params.merchantAdapter,
        ...(params.destinationAdapter && {
          destinationAdapter: params.destinationAdapter,
        }),
      };
      const { quote } = await buildQuote(
        {
          sourceChain: plan.originalDestinationChain,
          destinationChain: plan.refundDestinationChain,
          recipient,
          amount: plan.amount,
          ...adapters,
        },
        { config: resolvedConfig },
      );
      const result = await tracked(quote, listeners, (tracking, fee) =>
        runRoute({ quote, ...adapters }, tracking, fee),
      );
      return attachMetadata(result, refundMetadata);
    },
  };

  /**
   * Keeps a bridge's record in the store: `signing` before anything runs,
   * `burned` with the hash the moment the wallet returns it, `minted` at the
   * end. A transfer that never burned leaves nothing behind.
   */
  async function tracked(
    quote: Quote,
    listeners: SendListeners | undefined,
    run: (listeners: SendListeners, fee?: FeeCharge) => Promise<SendResult>,
  ): Promise<SendResult> {
    const fee = customFeeFor(quote);
    let onFeeSettled: ((outcome: CustomFeeOutcome) => void) | undefined;
    const charge = fee
      ? createFeeCharge(fee, (outcome) => onFeeSettled?.(outcome))
      : undefined;
    const withFee = (result: SendResult): SendResult =>
      charge ? { ...result, customFee: charge.outcome() } : result;

    const plan = quote.plan;
    if (quote.route.kind !== "bridge" || !plan) {
      return withFee(await run(listeners ?? {}, charge));
    }
    const now = Date.now();
    let record: InflightRecord = {
      version: 2,
      id: quote.id,
      network: plan.network,
      sourceChain: quote.route.sourceChain,
      destinationChain: quote.route.destinationChain,
      mint: plan.mint.kind,
      speed: plan.speed,
      amountBurned: quote.subunits.burnAmount.toString(),
      recipient: quote.recipient.address,
      step: "signing",
      ...(fee && {
        customFee: { amount: fee.totalAmount.toString(), status: "unpaid" },
      }),
      createdAt: now,
      updatedAt: now,
    };
    await store.put(record);

    let writes = Promise.resolve();
    const save = (patch: Partial<InflightRecord>) => {
      record = { ...record, ...patch, updatedAt: Date.now() };
      const snapshot = record;
      writes = writes.then(() => store.put(snapshot));
    };
    onFeeSettled = (outcome) => {
      if (!fee) return;
      save({
        customFee: {
          amount: fee.totalAmount.toString(),
          status: outcome.status,
          ...(outcome.txHashes && { txHashes: outcome.txHashes }),
        },
      });
    };
    const tracking: SendListeners = {
      onBurnSubmitted: (txHash) => {
        save({ step: "burned", sourceTxHash: txHash });
        listeners?.onBurnSubmitted?.(txHash);
      },
      onStep: (step) => {
        if (step.name === "fetchAttestation" && step.state === "success") {
          save({ step: "attested" });
        }
        listeners?.onStep?.(step);
      },
    };

    let result: SendResult;
    try {
      result = await run(tracking, charge);
    } catch (err) {
      await writes;
      if (!record.sourceTxHash) await store.remove(record.id);
      throw err;
    }
    await writes;
    if (result.kind === "success") {
      save({
        step: "minted",
        ...(result.finalTxHash && { mintTxHash: result.finalTxHash }),
      });
      await writes;
    } else if (!record.sourceTxHash) {
      await store.remove(record.id);
    }
    return withFee(result);
  }

  function customFeeFor(quote: Quote) {
    const route = quote.route;
    const source = getChain(
      route.kind === "bridge" ? route.sourceChain : route.chain,
    );
    if (source.ecosystem !== "evm") return null;
    return buildCustomFee(resolvedConfig.feePolicy, source as EvmChain);
  }

  /**
   * Refuses before any signature when the payer's USDC cannot cover what the
   * quote debits and, on Arc, the gas paid from the same balance. Balances
   * that cannot be read yet are left to the wallet.
   */
  async function assertCanPay(quote: Quote, adapter: WhiskAdapter) {
    if (adapter.kind !== "evm") return;
    const chain =
      quote.route.kind === "bridge"
        ? quote.route.sourceChain
        : quote.route.chain;
    const balance = await engine.balance({ chain, address: adapter.address });
    if (balance === null) return;
    const required =
      quote.subunits.amountIn +
      (await gasReserve(
        getChain(chain),
        quote.route.kind === "bridge" ? "bridge" : "send",
        chainRules,
      ));
    if (balance < required) {
      throw new InsufficientBalanceError(
        formatUsdcAmount(required),
        formatUsdcAmount(balance),
        "USDC",
      );
    }
  }

  type Adapters = { adapter: WhiskAdapter; destinationAdapter?: WhiskAdapter };

  function quoteParams(quote: Quote, adapters: Adapters): QuoteParams {
    const route = quote.route;
    return {
      sourceChain: route.kind === "bridge" ? route.sourceChain : route.chain,
      destinationChain:
        route.kind === "bridge" ? route.destinationChain : route.chain,
      recipient: quote.recipient,
      amount: formatUsdcAmount(quote.subunits.requested),
      token: quote.token,
      ...adapters,
    };
  }

  async function changed(
    quote: Quote,
    adapters: Adapters,
  ): Promise<QuoteChangedError> {
    const fresh = await buildQuote(quoteParams(quote, adapters), {
      config: resolvedConfig,
      skipRecipientChecks: true,
    });
    return new QuoteChangedError(quote, fresh.quote);
  }

  /**
   * Holds `send` to the confirmed quote. Fresh Iris fees must still fit under
   * `quote.maxFee`; the burn then uses the quote's amounts, never fresh ones.
   */
  async function bindBridgeQuote(
    quote: Quote,
    plan: RoutePlan,
    adapters: Adapters,
  ) {
    const forwarded = plan.mint.kind === "forwarder";
    if (
      quote.plan?.speed !== plan.speed ||
      quote.plan.mint.kind !== plan.mint.kind
    ) {
      throw await changed(quote, adapters);
    }
    const tier = await fetchFeeTier({
      network: plan.network,
      source: plan.source,
      destination: plan.destination,
      plan,
      useForwarder: forwarded,
      ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
    });
    const rpcUrls = rpcUrlsFor(resolvedConfig, plan.source.id as Chain);
    const held = {
      tier,
      burnAmount: quote.subunits.burnAmount,
      burnFee: quote.subunits.burnFee,
      forwarderFee: quote.subunits.forwarderFee,
      maxFee: quote.subunits.maxFee,
    };
    if (quote.feeMode === "upfront") {
      return {
        ...held,
        upfront: await signUpfrontFee(quote, plan, adapters, rpcUrls),
      };
    }
    // What Circle charges now: the unbuffered protocol fee and the `med`
    // forwarding fee, Circle's recommended floor.
    const required = await computeBridgeFees(
      {
        source: plan.source,
        plan,
        tier,
        forwarderLevel: "med",
        useForwarder: forwarded,
        ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
        ...(rpcUrls && { rpcUrls }),
      },
      quote.subunits.burnAmount,
      { buffered: false },
    );
    if (required.maxFee > quote.subunits.maxFee) {
      throw await changed(quote, adapters);
    }
    return { ...held, upfront: undefined };
  }

  /**
   * Fetched at send time because Circle's quote lasts about two minutes. A
   * signed fee above the shown one goes back to the payer; an expired quote
   * is fetched once more before giving up.
   */
  async function signUpfrontFee(
    quote: Quote,
    plan: RoutePlan,
    adapters: Adapters,
    rpcUrls: readonly string[] | undefined,
  ): Promise<UpfrontFee> {
    const source = plan.source as EvmChain;
    const requests: UpfrontFeeType[] = [];
    if (plan.mint.kind === "forwarder") requests.push("FORWARD");
    if (plan.speed === "fast") requests.push("PRE_FINALITY");
    for (let attempt = 0; attempt < 2; attempt++) {
      const signed = await getSignedBurnQuote(
        plan.network,
        source.cctpDomain,
        plan.destination.cctpDomain,
        {
          amount: quote.subunits.burnAmount,
          feeToken: source.usdc,
          requests,
        },
        resolvedConfig.fetch ? { fetch: resolvedConfig.fetch } : {},
      );
      if (signed.feeTotalAmount > quote.subunits.maxFee) {
        throw await changed(quote, adapters);
      }
      if (!(await hasExpired(signed.expiry, source, rpcUrls))) {
        return {
          signedQuote: signed.signedQuote,
          fee: signed.feeTotalAmount,
          approveAmount: quote.subunits.burnAmount + quote.subunits.maxFee,
        };
      }
    }
    throw new QuoteExpiredError(quote);
  }

  async function hasExpired(
    expiry: SignedQuoteExpiry,
    source: EvmChain,
    rpcUrls: readonly string[] | undefined,
  ): Promise<boolean> {
    if (expiry.mode === "TIMESTAMP") {
      return Date.now() >= expiry.expiresAt * 1000;
    }
    const block = await getBlockNumber(source, {
      ...(rpcUrls && { rpcUrls }),
      ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
    });
    return block >= expiry.expiresAtBlock;
  }

  async function runRoute(
    given: Adapters & { quote: Quote },
    listeners?: SendListeners,
    customFee?: FeeCharge,
  ): Promise<SendResult> {
    const input = {
      ...given,
      adapter: ruled(given.adapter),
      ...(given.destinationAdapter && {
        destinationAdapter: ruled(given.destinationAdapter),
      }),
    };
    const { sourceChain, destinationChain } = quoteParams(input.quote, input);
    const recipient = input.quote.recipient;
    const amount = input.quote.subunits.requested;
    const route = decideRoute(sourceChain, destinationChain);

    if (isSendRoute(route)) {
      const cctpChain = getChain(route.chain);

      if (cctpChain.ecosystem === "solana") {
        const adapter = expectSolanaAdapter(input.adapter, cctpChain);
        return executeSameChainSolanaSend(
          {
            chain: cctpChain,
            recipientAddress: recipient.address,
            amount,
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
            recipientAddress: recipient.address,
            amount,
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
            recipientAddress: recipient.address,
            amount,
            adapter,
          },
          listeners,
        );
      }

      const evmSendChain = cctpChain as EvmChain;
      const adapter = expectEvmAdapter(input.adapter, evmSendChain);
      return executeSameChainSend(
        {
          chain: evmSendChain,
          recipientAddress: recipient.address,
          amount,
          adapter,
          ...(customFee && { customFee }),
        },
        listeners,
      );
    }

    if (isBridgeRoute(route)) {
      const plan = await fitFastAllowance(
        planRoute({
          source: route.sourceChain,
          destination: route.destinationChain,
          connected: connectedEcosystems(
            input.adapter,
            input.destinationAdapter,
          ),
          useForwarder,
        }),
        input.quote.subunits.burnAmount,
        resolvedConfig.fetch,
      );
      const { source, destination, network } = plan;
      const forwarded = plan.mint.kind === "forwarder";
      const bridge = await bindBridgeQuote(input.quote, plan, input);

      if (source.ecosystem === "evm" && destination.ecosystem === "evm") {
        const evmSource = source as EvmChain;
        const evmDestination = destination as EvmChain;
        const evmAdapter = expectEvmAdapter(input.adapter, evmSource);
        return executeBridge(
          {
            ...(bridge.upfront && { upfront: bridge.upfront }),
            network,
            ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
            source: evmSource,
            destination: evmDestination,
            recipientAddress: recipient.address,
            burnAmount: bridge.burnAmount,
            maxFee: bridge.maxFee,
            burnFee: bridge.burnFee,
            forwarderFee: bridge.forwarderFee,
            tier: bridge.tier,
            useForwarder: forwarded,
            sourceAdapter: evmAdapter,
            ...(customFee && { customFee }),
          },
          listeners,
        );
      }

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
            recipientAddress: recipient.address as `0x${string}`,
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
        return executeEvmToStarknet(
          {
            ...(bridge.upfront && { upfront: bridge.upfront }),
            network,
            ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
            source: evmSource,
            destination: starknetDest,
            recipientAddress: recipient.address,
            burnAmount: bridge.burnAmount,
            maxFee: bridge.maxFee,
            burnFee: bridge.burnFee,
            forwarderFee: bridge.forwarderFee,
            tier: bridge.tier,
            sourceAdapter: evmAdapter,
            destinationAdapter: destAdapter,
            ...(customFee && { customFee }),
          },
          listeners,
        );
      }

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
            recipientAddress: recipient.address as `0x${string}`,
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
        return executeEvmToStellar(
          {
            network,
            ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
            source: evmSource,
            destination: stellarDest,
            recipientAddress: recipient.address,
            burnAmount: bridge.burnAmount,
            maxFee: bridge.maxFee,
            burnFee: bridge.burnFee,
            forwarderFee: bridge.forwarderFee,
            tier: bridge.tier,
            sourceAdapter: evmAdapter,
            destinationAdapter: destAdapter,
            ...(customFee && { customFee }),
          },
          listeners,
        );
      }

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
            recipientAddress: recipient.address as `0x${string}`,
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
            recipientAddress: recipient.address,
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
            recipientAddress: recipient.address,
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
            recipientAddress: recipient.address,
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
            recipientAddress: recipient.address,
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
            recipientAddress: recipient.address,
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
            recipientAddress: recipient.address,
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
        return executeEvmToSolana(
          {
            ...(bridge.upfront && { upfront: bridge.upfront }),
            network,
            ...(resolvedConfig.fetch && { fetch: resolvedConfig.fetch }),
            source: evmSource,
            destination: solDestination,
            recipientAddress: recipient.address,
            burnAmount: bridge.burnAmount,
            maxFee: bridge.maxFee,
            burnFee: bridge.burnFee,
            forwarderFee: bridge.forwarderFee,
            tier: bridge.tier,
            sourceAdapter: evmAdapter,
            destinationAdapter: destAdapter,
            ...(customFee && { customFee }),
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
/** A resumed transfer reports the fee from its record. */
function withRecordedFee(
  result: SendResult,
  record: InflightRecord,
): SendResult {
  const fee = record.customFee;
  if (!fee) return result;
  const amount = formatUsdcAmount(BigInt(fee.amount));
  const txHashes = fee.txHashes as `0x${string}`[] | undefined;
  const customFee: CustomFeeOutcome =
    fee.status === "paid"
      ? { status: "paid", txHashes: txHashes ?? [], amount }
      : { status: "unpaid", amount, ...(txHashes && { txHashes }) };
  return { ...result, customFee };
}

function attachMetadata(
  result: SendResult,
  metadata: WhiskMetadata | undefined,
): SendResult {
  if (!metadata || Object.keys(metadata).length === 0) return result;
  return { ...result, metadata };
}

export type { Chain };
