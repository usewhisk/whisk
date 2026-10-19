"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  getChain,
  isBridgeRoute,
  isSendRoute,
  QuoteChangedError,
  QuoteExpiredError,
  toWhiskError,
  type Chain,
  type ChainKind,
  type Quote,
  type ResolvedRecipient,
  type SendFailure,
  type SendSuccess,
  type WhiskAdapter,
  type WhiskError,
} from "@usewhisk/core";
import { Card } from "./ui/Card.js";
import { Banner } from "./ui/Banner.js";
import { Button } from "./ui/Button.js";
import { ChainPicker } from "./ui/ChainPicker.js";
import { ConnectModal } from "./ui/ConnectModal.js";
import { FieldBox } from "./ui/FieldBox.js";
import { PoweredByWhisk } from "./ui/PoweredByWhisk.js";
import { ResumeList } from "./ResumeList.js";
import { useWhiskContext } from "../hooks/useWhiskContext.js";
import { useWhiskEngine } from "../hooks/useWhiskEngine.js";
import { useEvmAdapter } from "../hooks/useEvmAdapter.js";
import { useSolanaAdapter } from "../hooks/useSolanaAdapter.js";
import { useStarknetAdapter } from "../hooks/useStarknetAdapter.js";
import { useStellarAdapter } from "../hooks/useStellarAdapter.js";
import { useStarknetWallet } from "../provider/starknetContext.js";
import { useStellarWallet } from "../provider/stellarContext.js";

export type WhiskSendProps = {
  /**
   * Restrict the visible tabs. Defaults to `["send", "bridge"]`. Pass a
   * single-element array to hide the other tab entirely.
   */
  tabs?: ReadonlyArray<"send" | "bridge">;
  /** Override the rendered title. */
  title?: string;
  /** Optional copy shown under the title. */
  description?: ReactNode;
  /**
   * Seed the amount field. The user can still edit it. Use `amount`
   * (below) to lock the field to a specific value.
   */
  defaultAmount?: string;
  /** Lock the amount field to this value (input is read-only). */
  amount?: string;
  /** Seed the recipient input. */
  defaultRecipient?: string;
  /** Lock the recipient input to this value. */
  recipient?: string;
  /** Seed the source chain. */
  defaultSourceChain?: Chain;
  /** Lock the source chain. */
  sourceChain?: Chain;
  /** Seed the destination chain (Bridge tab). */
  defaultDestinationChain?: Chain;
  /** Lock the destination chain. */
  destinationChain?: Chain;
  /** Fires once a transfer settles successfully. */
  onSuccess?: (result: SendSuccess) => void;
  /** Fires when the engine returns a failure. */
  onFailure?: (result: SendFailure) => void;
};

type TabKind = "send" | "bridge";

function ecosystemFor(chain: Chain): ChainKind {
  return getChain(chain).ecosystem;
}

/**
 * Whisk's drop-in USDC widget. Two tabs:
 *
 *   Send    — same-chain USDC transfer
 *   Bridge  — CCTP V2 Fast Transfer (cross-chain)
 *
 * Both share recipient + amount inputs. Bridge adds a destination
 * picker. The widget tracks both an EVM adapter (via wagmi) and a
 * Solana adapter (via Wallet Standard) and uses whichever matches the
 * source chain's ecosystem. Cross-ecosystem bridges error cleanly
 * today and land in S5.
 */
export function WhiskSend({
  tabs = ["send", "bridge"],
  title = "Send USDC",
  description,
  defaultAmount,
  amount: controlledAmount,
  defaultRecipient,
  recipient: controlledRecipient,
  defaultSourceChain,
  sourceChain: controlledSourceChain,
  defaultDestinationChain,
  destinationChain: controlledDestinationChain,
  onSuccess,
  onFailure,
}: WhiskSendProps) {
  const { config } = useWhiskContext();
  const engine = useWhiskEngine();
  const evmAdapter = useEvmAdapter();
  const solanaAdapter = useSolanaAdapter();
  const stellarAdapter = useStellarAdapter();
  const starknetAdapter = useStarknetAdapter();
  const evm = useAccount();
  const solana = useWallet();
  const stellar = useStellarWallet();
  const starknet = useStarknetWallet();
  const [showConnect, setShowConnect] = useState(false);

  const availableTabs = useMemo<TabKind[]>(
    () => (tabs.length ? Array.from(tabs) : ["send", "bridge"]),
    [tabs],
  );
  const [tab, setTab] = useState<TabKind>(availableTabs[0] ?? "send");

  // Pick defaults from the prop → config → first chain.
  const firstChain = config.chains[0];
  const [sourceChainState, setSourceChain] = useState<Chain>(
    defaultSourceChain ??
      config.defaultSourceChain ??
      firstChain ??
      ("Ethereum" as Chain),
  );
  const sourceChain = controlledSourceChain ?? sourceChainState;

  const [destinationChainState, setDestinationChain] = useState<Chain>(
    defaultDestinationChain ??
      config.defaultDestinationChain ??
      config.chains.find((c) => c !== sourceChain) ??
      sourceChain,
  );
  const destinationChain = controlledDestinationChain ?? destinationChainState;

  const [recipientState, setRecipient] = useState(defaultRecipient ?? "");
  const recipient = controlledRecipient ?? recipientState;

  const [amountState, setAmount] = useState(defaultAmount ?? "");
  const amount = controlledAmount ?? amountState;

  // Controlled inputs shouldn't accept user edits — they'd fail-silent.
  // Wrap the setters so calls become no-ops when the prop is set.
  const onSourceChange = useCallback(
    (v: Chain) => {
      if (controlledSourceChain === undefined) setSourceChain(v);
    },
    [controlledSourceChain],
  );
  const onDestinationChange = useCallback(
    (v: Chain) => {
      if (controlledDestinationChain === undefined) setDestinationChain(v);
    },
    [controlledDestinationChain],
  );
  const onRecipientChange = useCallback(
    (v: string) => {
      if (controlledRecipient === undefined) setRecipient(v);
    },
    [controlledRecipient],
  );
  const onAmountChange = useCallback(
    (v: string) => {
      if (controlledAmount === undefined) setAmount(v);
    },
    [controlledAmount],
  );

  const [resolved, setResolved] = useState<ResolvedRecipient | null>(null);
  const [recipientError, setRecipientError] = useState<string | null>(null);
  // A quote only counts for the inputs it was built from, so a refresh that
  // lands after an edit can never be sent for the new amount.
  const [quoted, setQuoted] = useState<{ key: string; quote: Quote } | null>(
    null,
  );
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [feeRise, setFeeRise] = useState<Quote | null>(null);
  const [sendError, setSendError] = useState<WhiskError | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SendSuccess | SendFailure | null>(null);

  const destinationForTab = tab === "send" ? sourceChain : destinationChain;
  const sourceEcosystem = useMemo(
    () => ecosystemFor(sourceChain),
    [sourceChain],
  );

  // Pick the source adapter that matches the source chain's ecosystem.
  const adapter: WhiskAdapter | null =
    sourceEcosystem === "solana"
      ? solanaAdapter
      : sourceEcosystem === "stellar"
        ? stellarAdapter
        : sourceEcosystem === "starknet"
          ? starknetAdapter
          : evmAdapter;

  // For cross-ecosystem bridges, the engine also needs a destination
  // adapter for the manual mint (EVM→Solana, EVM→Stellar, Solana→Stellar,
  // Stellar→EVM, Stellar→Solana). EVM→EVM and Solana→EVM go through
  // Iris's Forwarder and don't need one.
  const destinationEcosystem = useMemo(
    () => ecosystemFor(destinationForTab),
    [destinationForTab],
  );
  const destinationAdapter: WhiskAdapter | null = useMemo(() => {
    if (destinationEcosystem === sourceEcosystem) return null;
    if (destinationEcosystem === "solana") return solanaAdapter;
    if (destinationEcosystem === "stellar") return stellarAdapter;
    if (destinationEcosystem === "starknet") return starknetAdapter;
    return evmAdapter;
  }, [
    destinationEcosystem,
    sourceEcosystem,
    evmAdapter,
    solanaAdapter,
    stellarAdapter,
    starknetAdapter,
  ]);

  // A transfer never crosses between mainnet and testnet.
  const destinationCandidates = useMemo(() => {
    const network = getChain(sourceChain).network;
    return config.chains.filter(
      (c) => c !== sourceChain && getChain(c).network === network,
    );
  }, [config.chains, sourceChain]);

  // If the user flips source between ecosystems, the destination may
  // no longer be valid. Snap to the first valid candidate.
  useEffect(() => {
    if (
      destinationCandidates.length > 0 &&
      !destinationCandidates.includes(destinationChain)
    ) {
      setDestinationChain(destinationCandidates[0]!);
    }
  }, [destinationCandidates, destinationChain]);

  // Resolve the recipient input — addresses pass through verbatim, ENS
  // names hit the resolver. Debounced via a small delay so we don't
  // hammer the RPC on every keystroke.
  useEffect(() => {
    setResolved(null);
    setRecipientError(null);
    const trimmed = recipient.trim();
    if (!trimmed) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const r = await engine.resolve(trimmed, destinationForTab);
        if (!cancelled) setResolved(r);
      } catch (err) {
        if (!cancelled) {
          setRecipientError(
            err instanceof Error ? err.message : "Could not resolve recipient.",
          );
        }
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [recipient, destinationForTab, engine]);

  // The payer's USDC on the source chain, where the engine can read it.
  const payer = adapter?.kind === "evm" ? adapter.address : null;
  useEffect(() => {
    setBalance(null);
    setBalanceError(null);
    if (!payer) return;
    let cancelled = false;
    engine.balance({ chain: sourceChain, address: payer }).then(
      (held) => {
        if (!cancelled) setBalance(held);
      },
      (err: unknown) => {
        if (!cancelled) {
          setBalanceError(
            toWhiskError(err, "Could not read the balance.").message,
          );
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [payer, engine, sourceChain, result]);

  async function fillMax() {
    if (!adapter) return;
    setFilling(true);
    setBalanceError(null);
    try {
      const max = await engine.maxSendable({
        sourceChain,
        destinationChain: destinationForTab,
        // Fees do not depend on who receives, so the payer stands in until
        // a recipient is entered.
        recipient: resolved ?? {
          address: adapter.address,
          chain: destinationForTab,
        },
        adapter,
        ...(destinationAdapter && { destinationAdapter }),
      });
      if (max) onAmountChange(max.amount);
    } catch (err) {
      setBalanceError(
        toWhiskError(err, "Could not work out the maximum.").message,
      );
    } finally {
      setFilling(false);
    }
  }

  const balanceHelp =
    balanceError ??
    (balance !== null ? `Balance ${formatUnits(balance, 6)} USDC` : undefined);

  const quoteKey = [
    sourceChain,
    destinationForTab,
    resolved?.address ?? "",
    amount,
  ].join("|");
  const quote = quoted?.key === quoteKey ? quoted.quote : null;

  useEffect(() => {
    setFeeRise(null);
  }, [quoteKey]);

  // Quote the transfer whenever inputs change and we have a resolved
  // recipient. Same-chain quotes are free; bridge quotes hit Iris.
  useEffect(() => {
    setQuoteError(null);
    if (!resolved || !amount.trim() || !adapter) return;
    let cancelled = false;
    (async () => {
      try {
        const q = await engine.quote({
          sourceChain,
          destinationChain: destinationForTab,
          recipient: resolved,
          amount,
          adapter,
          ...(destinationAdapter && { destinationAdapter }),
        });
        if (!cancelled) setQuoted({ key: quoteKey, quote: q });
      } catch (err) {
        if (!cancelled) {
          setQuoteError(
            err instanceof Error ? err.message : "Could not build a quote.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    adapter,
    amount,
    destinationAdapter,
    destinationForTab,
    engine,
    quoteKey,
    refreshTick,
    resolved,
    sourceChain,
  ]);

  // Quotes expire after a minute; fetch a new one shortly before so the
  // payer never presses send on a lapsed quote.
  useEffect(() => {
    if (!quote || submitting) return;
    const lead = 5_000;
    const id = setTimeout(
      () => setRefreshTick((t) => t + 1),
      Math.max(0, quote.expiresAt - Date.now() - lead),
    );
    return () => clearTimeout(id);
  }, [quote, submitting]);

  // Reset the result panel when the user edits any input after a
  // success / failure — they're starting a new transfer.
  useEffect(() => {
    setResult(null);
    setSendError(null);
  }, [tab, sourceChain, destinationChain, recipient, amount]);

  async function handleSubmit() {
    if (!adapter || !resolved || !quote) return;
    setSubmitting(true);
    setResult(null);
    setFeeRise(null);
    setSendError(null);
    try {
      const r = await engine.send({
        adapter,
        ...(destinationAdapter && { destinationAdapter }),
        quote,
      });
      setResult(r);
      if (r.kind === "success") onSuccess?.(r);
      else onFailure?.(r);
    } catch (err) {
      if (err instanceof QuoteChangedError) {
        setQuoted({ key: quoteKey, quote: err.quote });
        setFeeRise(err.previous);
      } else if (err instanceof QuoteExpiredError) {
        setRefreshTick((t) => t + 1);
      } else {
        setSendError(toWhiskError(err, "The transfer could not be sent."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isSourceWalletConnected =
    sourceEcosystem === "solana"
      ? solana.connected
      : sourceEcosystem === "stellar"
        ? !!stellar?.address
        : sourceEcosystem === "starknet"
          ? !!starknet?.address
          : evm.isConnected;
  const sourceAddress =
    sourceEcosystem === "solana"
      ? solana.publicKey?.toBase58()
      : sourceEcosystem === "stellar"
        ? (stellar?.address ?? undefined)
        : sourceEcosystem === "starknet"
          ? (starknet?.address ?? undefined)
          : evm.address;
  const sourceNetworkLabel =
    sourceEcosystem === "solana"
      ? solana.wallet?.adapter.name
      : sourceEcosystem === "stellar"
        ? (stellar?.selectedWalletId ?? undefined)
        : sourceEcosystem === "starknet"
          ? (starknet?.wallet?.name ?? undefined)
          : evm.chain?.name;

  const canSubmit =
    isSourceWalletConnected &&
    !!adapter &&
    !!resolved &&
    !!quote &&
    !submitting;

  return (
    <Card className="whisk-send">
      <header className="whisk-header">
        <div>
          <h2 className="whisk-header__mark">{title}</h2>
          {description ? (
            <p className="whisk-header__tag">{description}</p>
          ) : null}
        </div>
        <div className="whisk-top-row__slot whisk-top-row__slot--end">
          {isSourceWalletConnected && sourceAddress ? (
            <button
              type="button"
              className="whisk-account-chip"
              onClick={() => setShowConnect(true)}
            >
              <span className="whisk-account-chip__avatar" aria-hidden />
              <span className="whisk-account-chip__address">
                {shortenAddress(sourceAddress)}
              </span>
              {sourceNetworkLabel ? (
                <span className="whisk-network-pill">{sourceNetworkLabel}</span>
              ) : null}
            </button>
          ) : (
            <Button variant="primary" onClick={() => setShowConnect(true)}>
              Connect wallet
            </Button>
          )}
        </div>
      </header>

      <ResumeList />

      {availableTabs.length > 1 ? (
        <Tabs.Root
          value={tab}
          onValueChange={(v) => setTab(v as TabKind)}
          className="whisk-tabs"
        >
          <Tabs.List className="whisk-tabs__list">
            {availableTabs.map((t) => (
              <Tabs.Trigger key={t} value={t} className="whisk-tabs__trigger">
                {t === "send" ? "Send" : "Bridge"}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Tabs.Content value={tab} className="whisk-tabs__content">
            <TransferForm
              tab={tab}
              chains={config.chains}
              destinationCandidates={destinationCandidates}
              sourceChain={sourceChain}
              destinationChain={destinationChain}
              onSourceChange={onSourceChange}
              onDestinationChange={onDestinationChange}
              recipient={recipient}
              onRecipientChange={onRecipientChange}
              recipientHint={
                resolved?.displayName
                  ? `${resolved.displayName} → ${shortenAddress(resolved.address)}`
                  : resolved
                    ? shortenAddress(resolved.address)
                    : undefined
              }
              recipientError={recipientError}
              amount={amount}
              onAmountChange={onAmountChange}
              balanceHelp={balanceHelp}
              {...(balance !== null && { onMax: () => void fillMax() })}
              filling={filling}
              quote={quote}
              quoteError={quoteError}
            />
          </Tabs.Content>
        </Tabs.Root>
      ) : (
        <TransferForm
          tab={tab}
          chains={config.chains}
          destinationCandidates={destinationCandidates}
          sourceChain={sourceChain}
          destinationChain={destinationChain}
          onSourceChange={setSourceChain}
          onDestinationChange={setDestinationChain}
          recipient={recipient}
          onRecipientChange={setRecipient}
          recipientHint={
            resolved?.displayName
              ? `${resolved.displayName} → ${shortenAddress(resolved.address)}`
              : resolved
                ? shortenAddress(resolved.address)
                : undefined
          }
          recipientError={recipientError}
          amount={amount}
          onAmountChange={setAmount}
          balanceHelp={balanceHelp}
          {...(balance !== null && { onMax: () => void fillMax() })}
          filling={filling}
          quote={quote}
          quoteError={quoteError}
        />
      )}

      {result ? <ResultPanel result={result} /> : null}
      {sendError ? (
        <div
          className="whisk-banner whisk-banner--error"
          role="alert"
          data-whisk-error={sendError.code}
        >
          <strong>Failed.</strong> {sendError.message}
        </div>
      ) : null}

      {feeRise && quote ? (
        <Banner variant="warning">
          Fees went up since your quote. You pay {feeRise.amountIn} →{" "}
          {quote.amountIn} {quote.token}, and the recipient gets{" "}
          {feeRise.amountOut} → {quote.amountOut} {quote.token}. Press the
          button again to confirm.
        </Banner>
      ) : null}

      <Button
        variant="primary"
        onClick={
          isSourceWalletConnected ? handleSubmit : () => setShowConnect(true)
        }
        disabled={isSourceWalletConnected && !canSubmit}
      >
        {!isSourceWalletConnected
          ? "Connect wallet"
          : submitting
            ? "Sending…"
            : feeRise
              ? "Confirm new fees"
              : tab === "bridge"
                ? "Bridge USDC"
                : "Send USDC"}
      </Button>

      <ConnectModal open={showConnect} onOpenChange={setShowConnect} />

      <PoweredByWhisk />
    </Card>
  );
}

type TransferFormProps = {
  tab: TabKind;
  chains: ReadonlyArray<Chain>;
  destinationCandidates: ReadonlyArray<Chain>;
  sourceChain: Chain;
  destinationChain: Chain;
  onSourceChange: (c: Chain) => void;
  onDestinationChange: (c: Chain) => void;
  recipient: string;
  onRecipientChange: (v: string) => void;
  recipientHint: string | undefined;
  recipientError: string | null;
  amount: string;
  onAmountChange: (v: string) => void;
  /** The payer's balance, or why it could not be read. */
  balanceHelp?: string | undefined;
  /** Shown as a Max button when the balance is known. */
  onMax?: () => void;
  filling?: boolean;
  quote: Quote | null;
  quoteError: string | null;
};

function TransferForm({
  tab,
  chains,
  destinationCandidates,
  sourceChain,
  destinationChain,
  onSourceChange,
  onDestinationChange,
  recipient,
  onRecipientChange,
  recipientHint,
  recipientError,
  amount,
  onAmountChange,
  balanceHelp,
  onMax,
  filling,
  quote,
  quoteError,
}: TransferFormProps) {
  return (
    <div className="whisk-form">
      <FieldBox
        label="From"
        suffix={
          <ChainPicker
            value={sourceChain}
            onChange={onSourceChange}
            chains={chains}
            ariaLabel="Source chain"
          />
        }
        readOnly
        value=""
        aria-label="Source chain selector"
      />

      {tab === "bridge" ? (
        <FieldBox
          label="To chain"
          suffix={
            <ChainPicker
              value={destinationChain}
              onChange={onDestinationChange}
              chains={destinationCandidates}
              ariaLabel="Destination chain"
            />
          }
          readOnly
          value=""
          aria-label="Destination chain selector"
        />
      ) : null}

      <FieldBox
        label="Recipient"
        placeholder="0x… or name.eth"
        value={recipient}
        onChange={(e) => onRecipientChange(e.target.value)}
        variant="mono"
        help={recipientHint}
        {...(recipientError ? { error: recipientError } : {})}
        autoComplete="off"
        spellCheck={false}
      />

      <FieldBox
        label="Amount"
        placeholder="0.00"
        value={amount}
        onChange={(e) => onAmountChange(e.target.value)}
        variant="amount"
        suffix={
          <>
            {onMax ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={filling}
                onClick={onMax}
              >
                Max
              </Button>
            ) : null}
            <span className="whisk-fieldbox__label">USDC</span>
          </>
        }
        inputMode="decimal"
        help={balanceHelp}
        {...(quoteError ? { error: quoteError } : {})}
      />

      {quote ? <QuoteSummary quote={quote} /> : null}
    </div>
  );
}

function QuoteSummary({ quote }: { quote: Quote }) {
  const bridge = isBridgeRoute(quote.route);
  const isSend = isSendRoute(quote.route);
  return (
    <div className="whisk-summary" aria-live="polite">
      <SummaryRow
        label={isSend ? "Recipient receives" : "Recipient gets"}
        value={`${quote.amountOut} ${quote.token}`}
      />
      {bridge ? (
        <SummaryRow
          label="You pay"
          value={`${quote.amountIn} ${quote.token}`}
        />
      ) : null}
      {quote.fees.entries.length > 0
        ? quote.fees.entries.map((entry, i) => (
            <SummaryRow
              key={`${entry.kind}-${i}`}
              label={entry.description ?? labelForKind(entry.kind)}
              value={`${entry.amount} ${entry.token}`}
              muted
            />
          ))
        : null}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="whisk-summary__row">
      <span
        className={
          muted ? "whisk-summary__label-muted" : "whisk-summary__label"
        }
      >
        {label}
      </span>
      <span className="whisk-summary__value">{value}</span>
    </div>
  );
}

function labelForKind(kind: string): string {
  switch (kind) {
    case "protocol":
      return "Protocol fee";
    case "forwarder":
      return "Destination mint fee";
    case "custom":
      return "Merchant fee";
    case "gas":
      return "Network fee";
    case "provider":
      return "Provider fee";
    default:
      return "Fee";
  }
}

function ResultPanel({ result }: { result: SendSuccess | SendFailure }) {
  if (result.kind === "success") {
    return (
      <div className="whisk-banner whisk-banner--info" role="status">
        <strong>Sent.</strong>{" "}
        {result.finalTxHash
          ? `Tx ${shortenHash(result.finalTxHash)}.`
          : "Transfer submitted."}
      </div>
    );
  }
  return (
    <div className="whisk-banner whisk-banner--error" role="alert">
      <strong>Failed.</strong> {result.error.message}
    </div>
  );
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function shortenHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}
