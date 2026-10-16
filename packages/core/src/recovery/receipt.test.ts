import { describe, expect, it } from "vitest";
import type { Chain } from "../types/chain.js";
import { deriveReceiptView } from "./receipt.js";

const BASE = "Base_Sepolia" as Chain;
const ARC = "Arc_Testnet" as Chain;
const SRC_TX = "0x" + "11".repeat(32);
const DST_TX = "0x" + "22".repeat(32);

describe("deriveReceiptView — same-chain", () => {
  it("treats same-chain transfers as settled with a single transfer step", () => {
    const view = deriveReceiptView({
      sourceChain: ARC,
      destinationChain: ARC,
      sourceTxHash: SRC_TX,
    });
    expect(view.isCrossChain).toBe(false);
    expect(view.stage).toBe("settled");
    expect(view.steps).toHaveLength(1);
    expect(view.steps[0]?.name).toBe("transfer");
    expect(view.steps[0]?.state).toBe("success");
  });

  it("marks failed when hasError is true on same-chain", () => {
    const view = deriveReceiptView({
      sourceChain: ARC,
      destinationChain: ARC,
      sourceTxHash: SRC_TX,
      hasError: true,
    });
    expect(view.stage).toBe("failed");
    expect(view.steps[0]?.state).toBe("error");
  });
});

describe("deriveReceiptView — cross-chain", () => {
  it("starts at 'submitted' with no Iris status yet", () => {
    const view = deriveReceiptView({
      sourceChain: BASE,
      destinationChain: ARC,
      sourceTxHash: SRC_TX,
    });
    expect(view.isCrossChain).toBe(true);
    expect(view.stage).toBe("submitted");
    expect(view.steps.map((s) => s.name)).toEqual([
      "burn",
      "fetchAttestation",
      "mint",
    ]);
    expect(view.steps[0]?.state).toBe("pending");
  });

  it("transitions to awaiting_attestation when Iris is pending", () => {
    const view = deriveReceiptView({
      sourceChain: BASE,
      destinationChain: ARC,
      sourceTxHash: SRC_TX,
      irisStatus: "pending_confirmations",
    });
    expect(view.stage).toBe("awaiting_attestation");
    expect(view.steps[0]?.state).toBe("success");
    expect(view.steps[1]?.state).toBe("pending");
    expect(view.steps[2]?.state).toBe("noop");
  });

  it("transitions to attested when Iris is complete but no destination tx", () => {
    const view = deriveReceiptView({
      sourceChain: BASE,
      destinationChain: ARC,
      sourceTxHash: SRC_TX,
      irisStatus: "complete",
    });
    expect(view.stage).toBe("attested");
    expect(view.steps[1]?.state).toBe("success");
    expect(view.steps[2]?.state).toBe("pending");
  });

  it("settles when destination tx is provided", () => {
    const view = deriveReceiptView({
      sourceChain: BASE,
      destinationChain: ARC,
      sourceTxHash: SRC_TX,
      destinationTxHash: DST_TX,
      irisStatus: "complete",
    });
    expect(view.stage).toBe("settled");
    expect(view.destinationExplorerUrl).toBeDefined();
    expect(view.steps[2]?.txHash).toBe(DST_TX);
    expect(view.steps[2]?.state).toBe("success");
  });

  it("settles even before Iris reports complete when destination tx is known", () => {
    const view = deriveReceiptView({
      sourceChain: BASE,
      destinationChain: ARC,
      sourceTxHash: SRC_TX,
      destinationTxHash: DST_TX,
    });
    expect(view.stage).toBe("settled");
  });

  it("fails when Iris reports failed", () => {
    const view = deriveReceiptView({
      sourceChain: BASE,
      destinationChain: ARC,
      sourceTxHash: SRC_TX,
      irisStatus: "failed",
    });
    expect(view.stage).toBe("failed");
    expect(view.steps[1]?.state).toBe("error");
    expect(view.steps[2]?.state).toBe("noop");
  });

  it("respects hasError override on cross-chain", () => {
    const view = deriveReceiptView({
      sourceChain: BASE,
      destinationChain: ARC,
      sourceTxHash: SRC_TX,
      hasError: true,
    });
    expect(view.stage).toBe("failed");
  });

  it("includes the source explorer URL even at the earliest stage", () => {
    const view = deriveReceiptView({
      sourceChain: BASE,
      destinationChain: ARC,
      sourceTxHash: SRC_TX,
    });
    expect(view.sourceExplorerUrl).toContain(SRC_TX);
  });
});
