/**
 * `feeBearer` defaulting — verifies the engine resolves the public default
 * to `"sender"` and that the resolved config reflects what the engine will
 * actually apply on a bridge.
 */
import { describe, expect, it } from "vitest";
import { Base } from "@usewhisk/cctp";
import type { WhiskConfig } from "../types/config.js";
import { DEFAULT_FEE_BEARER } from "../types/fee.js";
import { createWhisk as createEngine } from "./createWhisk.js";
import { createFakeEvmWallet, createFakeIris } from "../test/harness/index.js";

const RECIPIENT = "0x0000000000000000000000000000000000000020";

const iris = createFakeIris();
const createWhisk = (config: WhiskConfig) =>
  createEngine({ ...config, fetch: iris.fetch });

const adapter = createFakeEvmWallet({ chainId: Base.evmChainId }).adapter;

describe("feeBearer defaulting", () => {
  it("public default is 'sender'", () => {
    expect(DEFAULT_FEE_BEARER).toBe("sender");
  });

  it("createWhisk resolves feeBearer to 'sender' when omitted", () => {
    const engine = createWhisk({ chains: ["Base"] });
    expect(engine.config.feeBearer).toBe("sender");
  });

  it("createWhisk preserves an explicit 'receiver' setting", () => {
    const engine = createWhisk({ chains: ["Base"], feeBearer: "receiver" });
    expect(engine.config.feeBearer).toBe("receiver");
  });

  it("a bridge quote with default config grosses up amountIn so the recipient nets the requested amount", async () => {
    const engine = createWhisk({ chains: ["Base", "Arbitrum"] });
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "25",
      adapter,
    });
    expect(quote.amountOut).toBe("25");
    expect(Number(quote.amountIn)).toBeGreaterThan(25);
  });

  it("a bridge quote with feeBearer='receiver' debits the requested amount and shrinks amountOut", async () => {
    const engine = createWhisk({
      chains: ["Base", "Arbitrum"],
      feeBearer: "receiver",
    });
    const quote = await engine.quote({
      sourceChain: "Base",
      destinationChain: "Arbitrum",
      recipient: { address: RECIPIENT, chain: "Arbitrum" },
      amount: "25",
      adapter,
    });
    expect(quote.amountIn).toBe("25");
    expect(Number(quote.amountOut)).toBeLessThan(25);
  });
});
