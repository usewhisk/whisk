import {
  getGasPrice,
  tryChainByEvmChainId,
  type EvmChain,
} from "@usewhisk/cctp";
import type { Chain } from "../types/chain.js";
import type { EvmAdapter, EvmCall } from "./adapter.js";

const GWEI = 1_000_000_000n;

/** Arc drops a transaction offering less than this. */
export const ARC_MIN_MAX_FEE_PER_GAS = 20n * GWEI;
/** Arc's docs suggest a small tip for inclusion under load. */
const ARC_PRIORITY_FEE = 1n * GWEI;

const ARC_CHAINS = new Set<string>(["Arc", "Arc_Testnet"]);

export type ChainRulesContext = {
  fetch?: typeof fetch;
  rpcUrls: (chain: Chain) => readonly string[] | undefined;
};

/**
 * Fee settings for Arc: a quarter above the gas price Arc reports, and never
 * under the 20 gwei floor. Arc's base fee is smoothed, so the margin covers
 * the time between this read and the block.
 */
export async function arcFees(
  chain: EvmChain,
  ctx: ChainRulesContext,
): Promise<Pick<EvmCall, "maxFeePerGas" | "maxPriorityFeePerGas">> {
  const rpcUrls = ctx.rpcUrls(chain.id as Chain);
  const gasPrice = await getGasPrice(chain, {
    ...(rpcUrls && { rpcUrls }),
    ...(ctx.fetch && { fetch: ctx.fetch }),
  });
  const withHeadroom = (gasPrice * 125n + 99n) / 100n;
  return {
    maxFeePerGas:
      withHeadroom > ARC_MIN_MAX_FEE_PER_GAS
        ? withHeadroom
        : ARC_MIN_MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: ARC_PRIORITY_FEE,
  };
}

/**
 * Wraps a wallet so every call on Arc carries fee settings above its floor.
 * Elsewhere the wallet chooses. The chain is read when the calls are sent,
 * so a wallet that switched chains between calls is still covered.
 */
export function withChainRules(
  adapter: EvmAdapter,
  ctx: ChainRulesContext,
): EvmAdapter {
  return {
    ...adapter,
    async sendCalls(calls, options) {
      const chain = tryChainByEvmChainId(await adapter.getChainId());
      if (!chain || !ARC_CHAINS.has(chain.id)) {
        return adapter.sendCalls(calls, options);
      }
      const fees = await arcFees(chain, ctx);
      return adapter.sendCalls(
        calls.map((call) => ({ ...fees, ...call })),
        options,
      );
    },
  };
}
