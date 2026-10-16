/**
 * Vue composable that wraps `@usewhisk/core` with Vue's reactivity.
 *
 * Same shape as the React `useWhisk` hook, just driven by `ref` instead
 * of `useReducer`. Demonstrates that Whisk's engine is framework-
 * agnostic — the React package is one client, this is another.
 *
 * The EVM adapter is built on top of the injected browser wallet
 * (`window.ethereum`) via viem. No wagmi / no adapter SDKs required.
 */
import { ref, computed, type Ref, type ComputedRef } from "vue";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Chain as ViemChain,
} from "viem";
import { baseSepolia, sepolia } from "viem/chains";
import {
  chainInfo,
  createWhisk,
  toWhiskError,
  type Chain,
  type EvmAdapter,
  type EvmCall,
  type Quote,
  type SendResult,
  type Step,
  type WhiskAdapter,
  type WhiskEngine,
  type WhiskError,
} from "@usewhisk/core";

type SendState =
  | { kind: "idle" }
  | { kind: "quoting" }
  | { kind: "review"; quote: Quote }
  | { kind: "sending"; quote: Quote; steps: Step[] }
  | { kind: "succeeded"; result: SendResult; steps: Step[] }
  | { kind: "failed"; error: WhiskError; steps: Step[] };

export type UseWhiskEngineResult = {
  /** Hex address of the connected EVM wallet, or `null` when disconnected. */
  account: Ref<string | null>;
  /** Send flow state. Mirrors the React state machine shape. */
  state: Ref<SendState>;
  /** True between the connect-button click and the wallet handshake. */
  isConnecting: Ref<boolean>;
  /** Convenience boolean for the UI. */
  isReady: ComputedRef<boolean>;
  connect: () => Promise<void>;
  quote: (input: QuoteInput) => Promise<void>;
  send: () => Promise<void>;
  reset: () => void;
};

export type QuoteInput = {
  amount: string;
  recipientAddress: string;
  sourceChain: Chain;
  destinationChain: Chain;
};

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function getEthereum(): EthereumProvider | null {
  const w = window as unknown as { ethereum?: EthereumProvider };
  return w.ethereum ?? null;
}

const VIEM_CHAINS: Record<number, ViemChain> = {
  [baseSepolia.id]: baseSepolia,
  [sepolia.id]: sepolia,
};

const engine: WhiskEngine = createWhisk({
  chains: ["Base_Sepolia", "Ethereum_Sepolia"],
  mode: "testnet",
});

/**
 * Build a Whisk EvmAdapter from an injected `window.ethereum` provider.
 * The adapter uses viem's `custom()` transport for signing and an HTTP
 * transport for reads (the injected provider is not reliable for
 * receipt polling).
 */
function makeAdapter(
  provider: EthereumProvider,
  address: `0x${string}`,
): EvmAdapter {
  return {
    kind: "evm",
    address,

    async getChainId() {
      const raw = (await provider.request({
        method: "eth_chainId",
      })) as string;
      return parseInt(raw, 16);
    },

    async switchChain(chainId) {
      const info = chainInfoByEvmChainId(chainId);
      if (!info) {
        throw new Error(`Unsupported chainId ${chainId}`);
      }
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${chainId.toString(16)}` }],
        });
      } catch (err) {
        throw toWhiskError(err, "Failed to switch chain");
      }
    },

    async sendCalls(calls: EvmCall[]) {
      const viem = VIEM_CHAINS[await this.getChainId()];
      const walletClient = createWalletClient({
        account: address,
        transport: custom(provider),
        ...(viem && { chain: viem }),
      });
      const publicClient = createPublicClient({
        transport: viem ? http(viem.rpcUrls.default.http[0]) : custom(provider),
        ...(viem && { chain: viem }),
      });
      const hashes: `0x${string}`[] = [];
      for (let i = 0; i < calls.length; i++) {
        const call = calls[i]!;
        const hash = await walletClient.sendTransaction({
          to: call.to,
          data: call.data,
          value: call.value,
          account: address,
          chain: walletClient.chain ?? null,
        });
        hashes.push(hash);
        await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 2,
        });
        if (i < calls.length - 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      return { hashes };
    },

    async waitForReceipt(hash) {
      const chainId = await this.getChainId();
      const viem = VIEM_CHAINS[chainId];
      const publicClient = createPublicClient({
        transport: viem ? http(viem.rpcUrls.default.http[0]) : custom(provider),
        ...(viem && { chain: viem }),
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 2,
      });
      return {
        status: receipt.status === "success" ? "success" : "reverted",
        blockNumber: receipt.blockNumber,
      };
    },
  };
}

/** Reverse lookup: Whisk `chainInfo` doesn't index by evm chainId directly. */
function chainInfoByEvmChainId(
  chainId: number,
): ReturnType<typeof chainInfo> | null {
  for (const c of ["Base_Sepolia", "Ethereum_Sepolia"] as Chain[]) {
    const info = chainInfo(c);
    if (info.kind === "evm" && info.evmChainId === chainId) return info;
  }
  return null;
}

function mergeStep(steps: Step[], next: Step): Step[] {
  const idx = steps.findIndex((s) => s.name === next.name);
  if (idx === -1) return [...steps, next];
  const copy = steps.slice();
  copy[idx] = next;
  return copy;
}

export function useWhiskEngine(): UseWhiskEngineResult {
  const account = ref<string | null>(null);
  const adapter = ref<WhiskAdapter | null>(null);
  const isConnecting = ref(false);
  const state = ref<SendState>({ kind: "idle" });
  const lastInput = ref<QuoteInput | null>(null);

  const isReady = computed(() => adapter.value !== null);

  async function connect() {
    const ethereum = getEthereum();
    if (!ethereum) {
      state.value = {
        kind: "failed",
        error: toWhiskError(
          new Error(
            "MetaMask not detected. Install a browser wallet to continue.",
          ),
          "Connect failed",
        ),
        steps: [],
      };
      return;
    }
    isConnecting.value = true;
    try {
      const addresses = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const address = addresses[0] as `0x${string}` | undefined;
      if (!address) throw new Error("Wallet returned no accounts");
      account.value = address;
      adapter.value = makeAdapter(ethereum, address);
    } catch (err) {
      state.value = {
        kind: "failed",
        error: toWhiskError(err, "Connect failed"),
        steps: [],
      };
    } finally {
      isConnecting.value = false;
    }
  }

  async function quote(input: QuoteInput) {
    if (!adapter.value) return;
    lastInput.value = input;
    state.value = { kind: "quoting" };
    try {
      const recipient = await engine.resolve(
        input.recipientAddress,
        input.destinationChain,
      );
      const q = await engine.quote({
        recipient,
        amount: input.amount,
        sourceChain: input.sourceChain,
        destinationChain: input.destinationChain,
        adapter: adapter.value,
      });
      state.value = { kind: "review", quote: q };
    } catch (err) {
      state.value = {
        kind: "failed",
        error: toWhiskError(err, "Quote failed"),
        steps: [],
      };
    }
  }

  async function send() {
    if (state.value.kind !== "review") return;
    if (!adapter.value || !lastInput.value) return;
    const q = state.value.quote;
    const input = lastInput.value;
    state.value = { kind: "sending", quote: q, steps: [] };

    try {
      const recipient = await engine.resolve(
        input.recipientAddress,
        input.destinationChain,
      );
      const result = await engine.send(
        {
          recipient,
          amount: input.amount,
          sourceChain: input.sourceChain,
          destinationChain: input.destinationChain,
          adapter: adapter.value,
          quote: q,
        },
        {
          onStep: (step) => {
            if (state.value.kind !== "sending") return;
            state.value = {
              kind: "sending",
              quote: q,
              steps: mergeStep(state.value.steps, step),
            };
          },
        },
      );

      if (result.kind === "success") {
        state.value = {
          kind: "succeeded",
          result,
          steps: result.steps,
        };
      } else {
        state.value = {
          kind: "failed",
          error: result.error,
          steps: result.steps,
        };
      }
    } catch (err) {
      state.value = {
        kind: "failed",
        error: toWhiskError(err, "Send failed"),
        steps: state.value.kind === "sending" ? state.value.steps : [],
      };
    }
  }

  function reset() {
    state.value = { kind: "idle" };
    lastInput.value = null;
  }

  return { account, state, isConnecting, isReady, connect, quote, send, reset };
}
