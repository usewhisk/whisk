/**
 * Minimal viem-based `EvmAdapter` for headless server flows.
 *
 * Given a private key and a target chain, returns a Whisk `EvmAdapter`
 * that Whisk's engine can drive directly. Multi-chain runs can build
 * one adapter per chain and pass the right one to `engine.send`.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain as ViemChain,
  type Hex,
} from "viem";
import { nonceManager, privateKeyToAccount } from "viem/accounts";
import {
  arbitrumSepolia,
  arcTestnet,
  avalancheFuji,
  baseSepolia,
  lineaSepolia,
  optimismSepolia,
  polygonAmoy,
  sepolia,
  unichainSepolia,
  worldchainSepolia,
} from "viem/chains";
import { getChain, type EvmChain } from "@usewhisk/cctp";
import type {
  Chain,
  EvmAdapter,
  EvmCall,
  SendCallsOptions,
} from "@usewhisk/core";

const VIEM_CHAINS: Record<number, ViemChain> = {
  5_042_002: arcTestnet,
  11_155_111: sepolia,
  43_113: avalancheFuji,
  11_155_420: optimismSepolia,
  421_614: arbitrumSepolia,
  84_532: baseSepolia,
  80_002: polygonAmoy,
  1_301: unichainSepolia,
  59_141: lineaSepolia,
  4_801: worldchainSepolia,
};

function lookup(chain: Chain): { viem: ViemChain; cctp: EvmChain } {
  const cctp = getChain(chain);
  if (cctp.ecosystem !== "evm") {
    throw new Error(
      `createEvmAdapter: chain "${chain}" is not EVM; use a matching per-ecosystem adapter.`,
    );
  }
  const viem = VIEM_CHAINS[cctp.evmChainId];
  if (!viem) {
    throw new Error(
      `createEvmAdapter: no viem chain wired for evmChainId=${cctp.evmChainId}. Add it to VIEM_CHAINS.`,
    );
  }
  return { viem, cctp };
}

export type CreateEvmAdapterInput = {
  chain: Chain;
  privateKey: Hex;
  /** Optional RPC override; defaults to the chain's public endpoint. */
  rpcUrl?: string;
};

/**
 * Build a viem-based `EvmAdapter` bound to a single chain. `send`
 * routes each call through `walletClient.sendTransaction` and waits
 * for two confirmations before moving on (belt-and-suspenders against
 * RPC state lag on Sepolia).
 */
export function createEvmAdapter({
  chain,
  privateKey,
  rpcUrl,
}: CreateEvmAdapterInput): EvmAdapter {
  const { viem, cctp } = lookup(chain);
  const transport = http(rpcUrl ?? cctp.defaultRpcUrls[0]);
  const account = privateKeyToAccount(privateKey, { nonceManager });
  const publicClient = createPublicClient({ chain: viem, transport });
  const walletClient = createWalletClient({
    account,
    chain: viem,
    transport,
  });

  return {
    kind: "evm",
    address: account.address,

    async getChainId() {
      return viem.id;
    },

    async switchChain(target) {
      if (target !== viem.id) {
        throw new Error(
          `createEvmAdapter: this adapter is pinned to ${viem.id}; cannot switch to ${target}. Build one adapter per chain instead.`,
        );
      }
    },

    async sendCalls(calls: EvmCall[], options?: SendCallsOptions) {
      const hashes: `0x${string}`[] = [];
      for (let i = 0; i < calls.length; i++) {
        const call = calls[i]!;
        const hash = await walletClient.sendTransaction({
          to: call.to,
          data: call.data,
          value: call.value,
          ...(call.maxFeePerGas !== undefined && {
            maxFeePerGas: call.maxFeePerGas,
          }),
          ...(call.maxPriorityFeePerGas !== undefined && {
            maxPriorityFeePerGas: call.maxPriorityFeePerGas,
          }),
          account: walletClient.account!,
          chain: walletClient.chain,
        });
        hashes.push(hash);
        options?.onSubmitted?.(hash, hashes.length - 1);
        // CCTP burn depends on approve landing first. Two confirmations
        // are cheap insurance against RPC lag between the two calls.
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
