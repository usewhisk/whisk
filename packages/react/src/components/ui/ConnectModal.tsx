"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import type { Connector } from "wagmi";
import { useWallet, type Wallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import type { ISupportedWallet } from "@creit.tech/stellar-wallets-kit";
import { Button } from "./Button.js";
import { useWhiskContext } from "../../hooks/useWhiskContext.js";
import { useStellarWallet } from "../../provider/stellarContext.js";
import {
  useStarknetWallet,
  type StarknetWalletEntry,
} from "../../provider/starknetContext.js";

export type ConnectModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Override the modal title. Defaults adjust per step. */
  title?: string;
  /** Override the descriptive lede shown under the title. */
  description?: ReactNode;
};

type EcosystemKind = "evm" | "solana" | "stellar" | "starknet";

type EcosystemRow = {
  kind: EcosystemKind;
  label: string;
  /** Short hint shown under the row when the ecosystem isn't wired. */
  comingSoonLabel?: string;
  gradient: string;
};

/**
 * Static ecosystem catalogue. Order matches the visual priority in the
 * picker. The `kind` strings map 1:1 to the `WalletAdapterFactory.kind`
 * discriminator, so an entry only enables when the merchant added the
 * matching factory to `config.wallets`.
 */
const ECOSYSTEMS: ReadonlyArray<EcosystemRow> = [
  {
    kind: "evm",
    label: "EVM",
    gradient: "linear-gradient(135deg, #6c8eef 0%, #3a5fa8 100%)",
  },
  {
    kind: "solana",
    label: "Solana",
    gradient: "linear-gradient(135deg, #9945FF 0%, #14F195 100%)",
  },
  {
    kind: "stellar",
    label: "Stellar",
    gradient: "linear-gradient(135deg, #08b5e5 0%, #000000 100%)",
  },
  {
    kind: "starknet",
    label: "Starknet",
    gradient: "linear-gradient(135deg, #ec796b 0%, #29296e 100%)",
  },
] as const;

const ECOSYSTEMS_WITH_TRANSPORT: ReadonlySet<EcosystemKind> = new Set([
  "evm",
  "solana",
  "stellar",
  "starknet",
]);

type Step = "ecosystem" | "wallet";

/**
 * Wallet selection modal — two-step flow.
 *
 *   1. **Ecosystem picker** — user picks EVM, Solana, Stellar, Starknet.
 *      An ecosystem is clickable when (a) the merchant added the matching
 *      factory to `config.wallets`, AND (b) Whisk has a transport for it.
 *      Everything else renders as "Coming v1.x" placeholders so the
 *      multi-chain story stays visible from day one.
 *
 *   2. **Wallet picker** — for EVM the wagmi connectors detected in the
 *      browser. For Solana the wallets advertised via Wallet Standard
 *      (Phantom, Solflare, Backpack, etc.).
 *
 * When an account is connected on either ecosystem the modal flips to a
 * connected view regardless of step — disconnect, see address + network,
 * done.
 */
export function ConnectModal({
  open,
  onOpenChange,
  title,
  description,
}: ConnectModalProps) {
  const { config } = useWhiskContext();
  const evm = useAccount();
  const evmConnect = useConnect();
  const evmDisconnect = useDisconnect();
  const solana = useWallet();
  const stellar = useStellarWallet();
  const starknet = useStarknetWallet();

  const [step, setStep] = useState<Step>("ecosystem");
  const [selectedEcosystem, setSelectedEcosystem] =
    useState<EcosystemKind | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [solanaError, setSolanaError] = useState<string | null>(null);
  const [stellarError, setStellarError] = useState<string | null>(null);
  const [starknetError, setStarknetError] = useState<string | null>(null);

  // Always reopen on the ecosystem step and clear stale state when the
  // modal closes. wagmi's mutation error otherwise ghosts into the next
  // session.
  useEffect(() => {
    if (!open) {
      setStep("ecosystem");
      setSelectedEcosystem(null);
      setPendingId(null);
      setSolanaError(null);
      setStellarError(null);
      setStarknetError(null);
      evmConnect.reset();
    }
  }, [open, evmConnect]);

  const enabledKinds = useMemo(
    () => new Set(config.wallets.map((w) => w.kind as EcosystemKind)),
    [config.wallets],
  );

  function selectEcosystem(kind: EcosystemKind) {
    setSelectedEcosystem(kind);
    setStep("wallet");
  }

  function goBack() {
    setStep("ecosystem");
    setSelectedEcosystem(null);
    setPendingId(null);
    setSolanaError(null);
    setStellarError(null);
    evmConnect.reset();
  }

  async function handleEvmConnect(connector: Connector) {
    setPendingId(connector.uid);
    try {
      await evmConnect.connectAsync({ connector });
      onOpenChange(false);
    } catch {
      // Surface via `error` — leave the picker open so the user can retry.
    } finally {
      setPendingId(null);
    }
  }

  async function handleSolanaConnect(wallet: Wallet) {
    setSolanaError(null);
    setPendingId(wallet.adapter.name);
    try {
      solana.select(wallet.adapter.name as WalletName);
      // `select` is sync but `connect` only works after the next render
      // cycle picks up the new selected wallet. The Wallet Standard
      // adapter listens for the change and connects automatically when
      // `autoConnect` is set; otherwise we kick it manually below.
      await new Promise((r) => setTimeout(r, 0));
      await wallet.adapter.connect();
      onOpenChange(false);
    } catch (err) {
      setSolanaError(
        err instanceof Error ? err.message : "Failed to connect Solana wallet.",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function handleStellarConnect(wallet: ISupportedWallet) {
    if (!stellar) {
      setStellarError(
        "Stellar isn't enabled — add stellar() to config.wallets.",
      );
      return;
    }
    setStellarError(null);
    setPendingId(wallet.id);
    try {
      await stellar.selectWallet(wallet.id);
      onOpenChange(false);
    } catch (err) {
      setStellarError(
        err instanceof Error
          ? err.message
          : "Failed to connect Stellar wallet.",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function handleStarknetConnect(entry: StarknetWalletEntry) {
    if (!starknet) {
      setStarknetError(
        "Starknet isn't enabled — add starknet() to config.wallets.",
      );
      return;
    }
    if (!entry.wallet) {
      // Discovery-only entry — send the user to install. Prefer the
      // Chrome store, then fall back to Firefox / Edge / mobile stores.
      const downloads = entry.install?.downloads as
        | Record<string, string | undefined>
        | undefined;
      const url =
        downloads?.chrome ??
        downloads?.firefox ??
        downloads?.edge ??
        Object.values(downloads ?? {}).find((v): v is string => !!v);
      if (url) {
        window.open(url, "_blank", "noopener");
      }
      return;
    }
    setStarknetError(null);
    setPendingId(entry.id);
    try {
      await starknet.selectWallet(entry);
      onOpenChange(false);
    } catch (err) {
      setStarknetError(
        err instanceof Error
          ? err.message
          : "Failed to connect Starknet wallet.",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function handleDisconnect() {
    if (evm.isConnected) {
      await evmDisconnect.disconnectAsync().catch(() => {});
    }
    if (solana.connected) {
      await solana.disconnect().catch(() => {});
    }
    if (stellar?.address) {
      await stellar.disconnect().catch(() => {});
    }
    if (starknet?.address) {
      await starknet.disconnect().catch(() => {});
    }
    onOpenChange(false);
  }

  const isAnyConnected =
    evm.isConnected ||
    solana.connected ||
    !!stellar?.address ||
    !!starknet?.address;

  let resolvedTitle = title;
  if (!resolvedTitle) {
    if (isAnyConnected) resolvedTitle = "Connected";
    else if (step === "wallet" && selectedEcosystem)
      resolvedTitle = `${labelFor(selectedEcosystem)} wallet`;
    else resolvedTitle = "Connect a wallet";
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="whisk-dialog__overlay" />
        <Dialog.Content
          className="whisk-dialog__content"
          aria-describedby={undefined}
        >
          <div className="whisk-dialog__header">
            <div className="whisk-dialog__title-wrap">
              {step === "wallet" && !isAnyConnected ? (
                <button
                  type="button"
                  className="whisk-dialog__back"
                  onClick={goBack}
                  aria-label="Back to ecosystems"
                >
                  <BackIcon />
                </button>
              ) : null}
              <Dialog.Title className="whisk-dialog__title">
                {resolvedTitle}
              </Dialog.Title>
            </div>
            <Dialog.Close aria-label="Close" className="whisk-dialog__close">
              <CloseIcon />
            </Dialog.Close>
          </div>

          {description ? (
            <p className="whisk-dialog__lede">{description}</p>
          ) : null}

          {isAnyConnected ? (
            <ConnectedView
              evmAddress={evm.address}
              evmChainName={evm.chain?.name}
              solanaAddress={solana.publicKey?.toBase58()}
              solanaWalletName={solana.wallet?.adapter.name}
              stellarAddress={stellar?.address ?? undefined}
              stellarWalletId={stellar?.selectedWalletId ?? undefined}
              starknetAddress={starknet?.address ?? undefined}
              starknetWalletName={starknet?.wallet?.name ?? undefined}
              onDisconnect={handleDisconnect}
            />
          ) : step === "ecosystem" ? (
            <EcosystemPicker
              enabledKinds={enabledKinds}
              onSelect={selectEcosystem}
            />
          ) : selectedEcosystem === "evm" ? (
            <EvmWalletPicker
              connectors={evmConnect.connectors}
              isPending={evmConnect.isPending}
              pendingId={pendingId}
              errorMessage={evmConnect.error?.message}
              onConnect={handleEvmConnect}
            />
          ) : selectedEcosystem === "solana" ? (
            <SolanaWalletPicker
              wallets={solana.wallets}
              pendingId={pendingId}
              errorMessage={solanaError}
              onConnect={handleSolanaConnect}
            />
          ) : selectedEcosystem === "stellar" ? (
            <StellarWalletPicker
              wallets={stellar?.supportedWallets ?? []}
              pendingId={pendingId}
              errorMessage={stellarError}
              onConnect={handleStellarConnect}
            />
          ) : selectedEcosystem === "starknet" ? (
            <StarknetWalletPicker
              wallets={starknet?.supportedWallets ?? []}
              pendingId={pendingId}
              errorMessage={starknetError}
              onConnect={handleStarknetConnect}
            />
          ) : (
            <div className="whisk-dialog__list">
              <p className="whisk-dialog__lede">
                Support for this ecosystem is on the roadmap.
              </p>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type EcosystemPickerProps = {
  enabledKinds: Set<EcosystemKind>;
  onSelect: (kind: EcosystemKind) => void;
};

function EcosystemPicker({ enabledKinds, onSelect }: EcosystemPickerProps) {
  return (
    <div className="whisk-dialog__list">
      {ECOSYSTEMS.map((eco) => {
        const enabled =
          enabledKinds.has(eco.kind) && ECOSYSTEMS_WITH_TRANSPORT.has(eco.kind);
        const tag = enabled
          ? undefined
          : (eco.comingSoonLabel ?? "Coming soon");
        return (
          <Button
            key={eco.kind}
            variant="outline"
            className="whisk-dialog__row"
            disabled={!enabled}
            aria-disabled={!enabled}
            onClick={enabled ? () => onSelect(eco.kind) : undefined}
          >
            <span className="whisk-dialog__row-main">
              <span
                className="whisk-dialog__row-icon"
                aria-hidden
                style={{ width: 24, height: 24, background: eco.gradient }}
              />
              <span className="whisk-dialog__row-name">{eco.label}</span>
            </span>
            {tag ? (
              <span className="whisk-dialog__row-tag">{tag}</span>
            ) : (
              <span className="whisk-dialog__row-meta" aria-hidden>
                ›
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}

type EvmWalletPickerProps = {
  connectors: readonly Connector[];
  isPending: boolean;
  pendingId: string | null;
  errorMessage: string | undefined;
  onConnect: (connector: Connector) => void;
};

function EvmWalletPicker({
  connectors,
  isPending,
  pendingId,
  errorMessage,
  onConnect,
}: EvmWalletPickerProps) {
  if (connectors.length === 0) {
    return (
      <div className="whisk-dialog__list">
        <p className="whisk-dialog__lede">
          No EVM wallets detected. Install a browser wallet like MetaMask,
          Coinbase Wallet, or Rabby and reload.
        </p>
      </div>
    );
  }
  return (
    <div className="whisk-dialog__list">
      {connectors.map((c) => (
        <ConnectorRow
          key={c.uid}
          name={c.name}
          icon={c.icon}
          isPending={isPending && pendingId === c.uid}
          disabled={isPending && pendingId !== c.uid}
          onClick={() => onConnect(c)}
        />
      ))}
      {errorMessage ? (
        <p className="whisk-help whisk-help--error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

type SolanaWalletPickerProps = {
  wallets: readonly Wallet[];
  pendingId: string | null;
  errorMessage: string | null;
  onConnect: (wallet: Wallet) => void;
};

function SolanaWalletPicker({
  wallets,
  pendingId,
  errorMessage,
  onConnect,
}: SolanaWalletPickerProps) {
  if (wallets.length === 0) {
    return (
      <div className="whisk-dialog__list">
        <p className="whisk-dialog__lede">
          No Solana wallets detected. Install Phantom, Solflare, or Backpack and
          reload.
        </p>
      </div>
    );
  }
  return (
    <div className="whisk-dialog__list">
      {wallets.map((w) => (
        <ConnectorRow
          key={w.adapter.name}
          name={w.adapter.name}
          icon={w.adapter.icon}
          isPending={pendingId === w.adapter.name}
          disabled={pendingId !== null && pendingId !== w.adapter.name}
          onClick={() => onConnect(w)}
        />
      ))}
      {errorMessage ? (
        <p className="whisk-help whisk-help--error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

type StellarWalletPickerProps = {
  wallets: readonly ISupportedWallet[];
  pendingId: string | null;
  errorMessage: string | null;
  onConnect: (wallet: ISupportedWallet) => void;
};

function StellarWalletPicker({
  wallets,
  pendingId,
  errorMessage,
  onConnect,
}: StellarWalletPickerProps) {
  if (wallets.length === 0) {
    return (
      <div className="whisk-dialog__list">
        <p className="whisk-dialog__lede">
          Loading Stellar wallets… If nothing appears, install Freighter, xBull,
          Albedo, Lobstr, Hana, or Rabet and reload.
        </p>
      </div>
    );
  }
  // Show installed wallets first; install-required ones get a tag.
  const ordered = [...wallets].sort(
    (a, b) => Number(b.isAvailable) - Number(a.isAvailable),
  );
  return (
    <div className="whisk-dialog__list">
      {ordered.map((w) => (
        <ConnectorRow
          key={w.id}
          name={w.name}
          icon={w.icon}
          isPending={pendingId === w.id}
          disabled={pendingId !== null && pendingId !== w.id}
          onClick={() => onConnect(w)}
          metaLabel={w.isAvailable ? undefined : "Install"}
        />
      ))}
      {errorMessage ? (
        <p className="whisk-help whisk-help--error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

type StarknetWalletPickerProps = {
  wallets: readonly StarknetWalletEntry[];
  pendingId: string | null;
  errorMessage: string | null;
  onConnect: (wallet: StarknetWalletEntry) => void;
};

function StarknetWalletPicker({
  wallets,
  pendingId,
  errorMessage,
  onConnect,
}: StarknetWalletPickerProps) {
  if (wallets.length === 0) {
    return (
      <div className="whisk-dialog__list">
        <p className="whisk-dialog__lede">
          Loading Starknet wallets… If nothing appears, install Argent X or
          Braavos and reload.
        </p>
      </div>
    );
  }
  const ordered = [...wallets].sort(
    (a, b) => Number(!!b.wallet) - Number(!!a.wallet),
  );
  return (
    <div className="whisk-dialog__list">
      {ordered.map((w) => (
        <ConnectorRow
          key={w.id}
          name={w.name}
          icon={w.icon}
          isPending={pendingId === w.id}
          disabled={pendingId !== null && pendingId !== w.id}
          onClick={() => onConnect(w)}
          metaLabel={w.wallet ? undefined : "Install"}
        />
      ))}
      {errorMessage ? (
        <p className="whisk-help whisk-help--error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

type ConnectorRowProps = {
  name: string;
  icon: string | undefined;
  isPending: boolean;
  disabled: boolean;
  onClick: () => void;
  metaLabel?: string;
};

function ConnectorRow({
  name,
  icon,
  isPending,
  disabled,
  onClick,
  metaLabel,
}: ConnectorRowProps) {
  return (
    <Button
      variant="outline"
      className="whisk-dialog__row"
      onClick={onClick}
      disabled={disabled || isPending}
    >
      <span className="whisk-dialog__row-main">
        <ConnectorIcon name={name} icon={icon} />
        <span className="whisk-dialog__row-name">{name}</span>
      </span>
      <span className="whisk-dialog__row-meta">
        {isPending ? "Connecting…" : (metaLabel ?? null)}
      </span>
    </Button>
  );
}

function ConnectorIcon({
  name,
  icon,
}: {
  name: string;
  icon: string | undefined;
}) {
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        width={24}
        height={24}
        className="whisk-dialog__row-icon"
      />
    );
  }
  return (
    <span
      className="whisk-dialog__row-icon"
      aria-hidden
      title={name}
      style={{
        width: 24,
        height: 24,
        background:
          "linear-gradient(135deg, var(--whisk-primary), var(--whisk-border))",
      }}
    />
  );
}

type ConnectedViewProps = {
  evmAddress: `0x${string}` | undefined;
  evmChainName: string | undefined;
  solanaAddress: string | undefined;
  solanaWalletName: string | undefined;
  stellarAddress: string | undefined;
  stellarWalletId: string | undefined;
  starknetAddress: string | undefined;
  starknetWalletName: string | undefined;
  onDisconnect: () => void;
};

function ConnectedView({
  evmAddress,
  evmChainName,
  solanaAddress,
  solanaWalletName,
  stellarAddress,
  stellarWalletId,
  starknetAddress,
  starknetWalletName,
  onDisconnect,
}: ConnectedViewProps) {
  return (
    <div className="whisk-dialog__list">
      {evmAddress ? (
        <div
          className="whisk-account-chip"
          style={{ alignSelf: "stretch", justifyContent: "space-between" }}
        >
          <span className="whisk-dialog__row-main">
            <span className="whisk-account-chip__avatar" aria-hidden />
            <span className="whisk-account-chip__address">
              {shortenAddress(evmAddress)}
            </span>
          </span>
          {evmChainName ? (
            <span className="whisk-dialog__row-tag">{evmChainName}</span>
          ) : null}
        </div>
      ) : null}
      {solanaAddress ? (
        <div
          className="whisk-account-chip"
          style={{ alignSelf: "stretch", justifyContent: "space-between" }}
        >
          <span className="whisk-dialog__row-main">
            <span className="whisk-account-chip__avatar" aria-hidden />
            <span className="whisk-account-chip__address">
              {shortenAddress(solanaAddress)}
            </span>
          </span>
          {solanaWalletName ? (
            <span className="whisk-dialog__row-tag">{solanaWalletName}</span>
          ) : null}
        </div>
      ) : null}
      {stellarAddress ? (
        <div
          className="whisk-account-chip"
          style={{ alignSelf: "stretch", justifyContent: "space-between" }}
        >
          <span className="whisk-dialog__row-main">
            <span className="whisk-account-chip__avatar" aria-hidden />
            <span className="whisk-account-chip__address">
              {shortenAddress(stellarAddress)}
            </span>
          </span>
          {stellarWalletId ? (
            <span className="whisk-dialog__row-tag">{stellarWalletId}</span>
          ) : null}
        </div>
      ) : null}
      {starknetAddress ? (
        <div
          className="whisk-account-chip"
          style={{ alignSelf: "stretch", justifyContent: "space-between" }}
        >
          <span className="whisk-dialog__row-main">
            <span className="whisk-account-chip__avatar" aria-hidden />
            <span className="whisk-account-chip__address">
              {shortenAddress(starknetAddress)}
            </span>
          </span>
          {starknetWalletName ? (
            <span className="whisk-dialog__row-tag">{starknetWalletName}</span>
          ) : null}
        </div>
      ) : null}
      <Button variant="ghost" onClick={onDisconnect}>
        Disconnect
      </Button>
    </div>
  );
}

function labelFor(kind: EcosystemKind): string {
  return ECOSYSTEMS.find((e) => e.kind === kind)?.label ?? kind;
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M3 3l10 10M13 3L3 13" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 12L6 8l4-4" />
    </svg>
  );
}
