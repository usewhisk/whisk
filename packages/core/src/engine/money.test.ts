import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Arbitrum, Base } from "@usewhisk/cctp";
import type { WhiskConfig } from "../types/config.js";
import { createWhisk as createEngine } from "./createWhisk.js";
import { formatUsdcAmount } from "./amount.js";
import {
  createFakeEvmWallet,
  createFakeIris,
  type FakeIris,
} from "../test/harness/index.js";

const RECIPIENT = "0x0000000000000000000000000000000000000020";
const MERCHANT = "0x0000000000000000000000000000000000000030";

let iris: FakeIris;
beforeEach(() => {
  iris = createFakeIris();
  vi.stubGlobal("fetch", () => {
    throw new Error("the engine used the global fetch");
  });
});
afterEach(() => vi.unstubAllGlobals());

const createWhisk = (config: WhiskConfig) =>
  createEngine({ ...config, fetch: iris.fetch });

const adapter = () => createFakeEvmWallet({ chainId: Base.evmChainId }).adapter;

async function protocolFee(amount: string, minimumFee: number) {
  iris.setFees(Base.cctpDomain, Arbitrum.cctpDomain, [
    { finalityThreshold: 1000, minimumFee },
  ]);
  const engine = createWhisk({
    chains: ["Base", "Arbitrum"],
    feeBearer: "receiver",
    useForwarder: false,
  });
  const quote = await engine.quote({
    sourceChain: "Base",
    destinationChain: "Arbitrum",
    recipient: { address: RECIPIENT, chain: "Arbitrum" },
    amount,
    adapter: adapter(),
  });
  return formatUsdcAmount(quote.subunits.burnFee);
}

describe("money maths", () => {
  // 0.999999 USDC at 1.3 bps is 129.99987 subunits. Rounding down leaves
  // maxFee one short, and Circle then settles the burn as Standard.
  it("rounds the burn fee up (#67)", async () => {
    expect(await protocolFee("0.999999", 1.3)).toBe("0.00013");
  });

  // 1.1 * 100 is 110.00000000000001 in floating point.
  it("reads 1.1 bps from Iris as exactly 110 hundredths (#88)", async () => {
    expect(await protocolFee("1", 1.1)).toBe("0.00011");
  });

  it("adds a merchant fee to a large same-chain send without float error (#88)", async () => {
    const engine = createWhisk({
      chains: ["Base"],
      feePolicy: { value: "1", recipient: MERCHANT },
    });
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Base",
      recipient: { address: RECIPIENT, chain: "Base" },
      amount: "90071992547.409931",
      adapter: adapter(),
    });
    expect(quote.amountIn).toBe("90071992548.409931");
  });
});
