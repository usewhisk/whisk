import {
  attestationSeconds,
  buildMintIntent,
  chainByDomain,
  getBlockNumber,
  getChain,
  getMessages,
  getTransactionStatus,
  isEvmChain,
  isForwardDone,
  isNonceUsed,
  pollBudget,
  pollMessages,
  reattest,
  type CctpChain,
  type EvmChain,
  type IrisMessage,
} from "@usewhisk/cctp";
import {
  BridgeStepError,
  ConfigError,
  OnchainRevertError,
  RouteUnavailableError,
  WhiskError,
} from "../errors/errors.js";
import type { InflightRecord, InflightStore } from "../inflight/types.js";
import type { Chain } from "../types/chain.js";
import type { Step, StepName } from "../types/step.js";
import type {
  ResumeOptions,
  SendFailure,
  SendListeners,
  SendResult,
} from "./types.js";

export type ResumeContext = {
  store: InflightStore;
  fetch?: typeof fetch;
  rpcUrls: (chain: Chain) => readonly string[] | undefined;
};

const FORWARD_HOOK_MAGIC = "0x636374702d666f7277617264";

/**
 * The attestation's expiry is counted in L1 blocks on these chains, so their
 * own block number says nothing about it. A mint is tried first and an
 * expired one re-attested after it reverts.
 */
const L1_EXPIRY_CHAINS = new Set<string>([
  "Arbitrum",
  "Arbitrum_Sepolia",
  "Edge",
  "Edge_Testnet",
  "Plume",
  "Plume_Testnet",
]);

export async function resumeTransfer(
  record: InflightRecord,
  options: ResumeOptions,
  ctx: ResumeContext,
  listeners?: SendListeners,
): Promise<SendResult> {
  const steps: Step[] = [];
  const emit = (step: Step) => {
    const i = steps.findIndex((s) => s.name === step.name);
    if (i === -1) steps.push(step);
    else steps[i] = step;
    listeners?.onStep?.(step);
  };
  const fail = (name: StepName, error: WhiskError): SendFailure => {
    emit({ name, state: "error", errorMessage: error.message });
    return { kind: "failure", error, steps };
  };
  const save = (patch: Partial<InflightRecord>) => {
    record = { ...record, ...patch, updatedAt: Date.now() };
    return ctx.store.put(record);
  };

  const hash = record.sourceTxHash;
  if (!hash) {
    return fail(
      "burn",
      new ConfigError(
        "No burn was recorded for this transfer. If the wallet shows one, resume it from that tx hash.",
      ),
    );
  }
  const source = getChain(record.sourceChain);
  const destination = getChain(record.destinationChain);
  const fetchOpts = ctx.fetch ? { fetch: ctx.fetch } : {};
  const rpc = (chain: CctpChain) => {
    const rpcUrls = ctx.rpcUrls(chain.id as Chain);
    return { ...(rpcUrls && { rpcUrls }), ...fetchOpts };
  };

  if (isEvmChain(source)) {
    const status = await getTransactionStatus(
      source,
      hash as `0x${string}`,
      rpc(source),
    );
    if (status === "reverted") {
      await ctx.store.remove(record.id);
      return fail(
        "burn",
        new OnchainRevertError(
          "reverted_onchain",
          "The burn reverted, so no USDC left the wallet. Nothing to resume.",
          undefined,
          "burn",
        ),
      );
    }
  }
  emit({ name: "burn", state: "success", txHash: hash });

  emit({ name: "fetchAttestation", state: "pending" });
  const budget = pollBudget(attestationSeconds(source, record.speed));
  let message = await pollMessages(
    { sourceDomain: source.cctpDomain, transactionHash: hash },
    {
      network: record.network,
      ...fetchOpts,
      ...budget,
      isDone: (m) => m.status === "complete",
    },
  );
  if (!message || message.status !== "complete") {
    return fail(
      "fetchAttestation",
      new BridgeStepError(
        "fetchAttestation",
        "Circle has not attested the burn yet. Resume again later.",
        { retryable: true },
      ),
    );
  }
  const decodedDomain = message.decodedMessage?.destinationDomain;
  if (
    decodedDomain !== undefined &&
    decodedDomain !== String(destination.cctpDomain)
  ) {
    return fail(
      "fetchAttestation",
      new ConfigError(
        `The burn is bound for domain ${decodedDomain}, not ${destination.id}.`,
      ),
    );
  }
  await save({ step: "attested" });
  emit({ name: "fetchAttestation", state: "success" });

  if (record.mint === "forwarder") {
    emit({ name: "mint", state: "pending", forwarded: true });
    const forwarded = await pollMessages(
      { sourceDomain: source.cctpDomain, transactionHash: hash },
      { network: record.network, ...fetchOpts, ...budget },
    );
    if (forwarded && isForwardDone(forwarded)) {
      const mintTxHash = forwarded.forwardTxHash ?? undefined;
      await save({ step: "minted", ...(mintTxHash && { mintTxHash }) });
      emit({
        name: "mint",
        state: "success",
        forwarded: true,
        ...(mintTxHash && { txHash: mintTxHash }),
      });
      return {
        kind: "success",
        ...(mintTxHash && { finalTxHash: mintTxHash }),
        steps,
      };
    }
    if (forwarded?.forwardState !== "FAILED") {
      return fail(
        "mint",
        new BridgeStepError(
          "mint",
          "Circle's relayer has not minted yet. Resume again later.",
          { retryable: true },
        ),
      );
    }
    message = forwarded;
  }

  if (!isEvmChain(destination)) {
    return fail(
      "mint",
      new ConfigError(
        `Resuming a mint on ${destination.id} is not supported yet. The attestation is ready for a manual mint.`,
      ),
    );
  }
  return mintOnEvm(destination, message);

  async function mintOnEvm(
    dest: EvmChain,
    attested: IrisMessage,
  ): Promise<SendResult> {
    const nonce = attested.eventNonce as `0x${string}`;
    if (await isNonceUsed(dest, nonce, rpc(dest))) {
      await save({ step: "minted" });
      emit({ name: "mint", state: "success", forwarded: false });
      return { kind: "success", steps };
    }
    const adapter = options.destinationAdapter;
    if (!adapter || adapter.kind !== "evm") {
      throw new RouteUnavailableError(
        "destination_adapter_required",
        `Connect a wallet on ${dest.id} to finish this transfer.`,
        "evm",
      );
    }

    let current = attested;
    if (!L1_EXPIRY_CHAINS.has(dest.id) && (await hasExpired(dest, current))) {
      current = await reattested(current);
    }

    emit({ name: "mint", state: "pending", forwarded: false });
    for (let attempt = 0; attempt < 2; attempt++) {
      const live = await adapter.getChainId();
      if (live !== dest.evmChainId) await adapter.switchChain(dest.evmChainId);
      const intent = buildMintIntent({
        destination: dest,
        message: current.message,
        attestation: current.attestation,
      });
      const { hashes } = await adapter.sendCalls([
        {
          to: intent.call.to,
          data: intent.call.data,
          value: intent.call.value,
        },
      ]);
      const mintTxHash = hashes[hashes.length - 1];
      if (!mintTxHash) break;
      const receipt = await adapter.waitForReceipt(mintTxHash);
      if (receipt.status === "success") {
        await save({ step: "minted", mintTxHash });
        emit({
          name: "mint",
          state: "success",
          forwarded: false,
          txHash: mintTxHash,
        });
        return { kind: "success", finalTxHash: mintTxHash, steps };
      }
      // An expired attestation reverts without using the nonce, so it can be
      // re-attested and minted once more.
      if (attempt > 0 || expirationOf(current) === 0n) break;
      current = await reattested(current);
    }
    return fail(
      "mint",
      new OnchainRevertError(
        "reverted_onchain",
        `The mint on ${dest.id} reverted.`,
        undefined,
        "mint",
      ),
    );
  }

  async function hasExpired(dest: EvmChain, m: IrisMessage): Promise<boolean> {
    const expiresAt = expirationOf(m);
    if (expiresAt === 0n) return false;
    return (await getBlockNumber(dest, rpc(dest))) >= expiresAt;
  }

  async function reattested(m: IrisMessage): Promise<IrisMessage> {
    await reattest(m.eventNonce, { network: record.network, ...fetchOpts });
    const fresh = await pollMessages(
      { sourceDomain: source.cctpDomain, nonce: m.eventNonce },
      {
        network: record.network,
        ...fetchOpts,
        ...budget,
        isDone: (next) =>
          next.status === "complete" && expirationOf(next) === 0n,
      },
    );
    if (!fresh || expirationOf(fresh) !== 0n) {
      throw new BridgeStepError(
        "fetchAttestation",
        "Circle has not re-attested the burn yet. Resume again later.",
        { retryable: true },
      );
    }
    return fresh;
  }
}

function expirationOf(m: IrisMessage): bigint {
  const raw = m.decodedMessage?.decodedMessageBody?.expirationBlock;
  return raw && /^\d+$/.test(raw) ? BigInt(raw) : 0n;
}

/**
 * A record for a burn known only by its hash, built from what Iris decoded.
 * Throws until Iris has seen the burn.
 */
export async function recordFromTx(
  sourceChain: Chain,
  txHash: string,
  fetchImpl: typeof fetch | undefined,
): Promise<InflightRecord> {
  const source = getChain(sourceChain);
  const [first] = await getMessages(
    { sourceDomain: source.cctpDomain, transactionHash: txHash },
    { network: source.network, ...(fetchImpl && { fetch: fetchImpl }) },
  );
  const decoded = first?.decodedMessage;
  const body = decoded?.decodedMessageBody;
  if (!first || !decoded || !body) {
    throw new BridgeStepError(
      "fetchAttestation",
      `Circle has not seen a burn in ${txHash} on ${sourceChain} yet.`,
      { retryable: true },
    );
  }
  if (!/^\d+$/.test(decoded.destinationDomain)) {
    throw new BridgeStepError(
      "fetchAttestation",
      `Iris decoded destination domain ${decoded.destinationDomain} is not a number.`,
    );
  }
  const destination = chainByDomain(
    Number.parseInt(decoded.destinationDomain, 10) as CctpChain["cctpDomain"],
    source.network,
  );
  const forwarded =
    first.forwardState != null ||
    (body.hookData?.toLowerCase().startsWith(FORWARD_HOOK_MAGIC) ?? false);
  const now = Date.now();
  return {
    version: 2,
    id: `tx:${sourceChain}:${txHash.toLowerCase()}`,
    network: source.network,
    sourceChain,
    destinationChain: destination.id as Chain,
    mint: forwarded ? "forwarder" : "adapter",
    speed: decoded.minFinalityThreshold === "1000" ? "fast" : "standard",
    amountBurned: body.amount,
    recipient: body.mintRecipient ?? "",
    step: "burned",
    sourceTxHash: txHash,
    createdAt: now,
    updatedAt: now,
  };
}
