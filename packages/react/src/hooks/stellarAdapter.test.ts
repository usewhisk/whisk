import { describe, expect, it, vi } from "vitest";
import { Asset, Keypair, rpc as sorobanRpc, xdr } from "@stellar/stellar-sdk";
import { WhiskError, getChain, type StellarChain } from "@usewhisk/core";
import { stellar } from "../config/adapters/stellar.js";
import type { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { createStellarAdapter } from "./stellarAdapter.js";

const ACCOUNT = Keypair.random().publicKey();
const chain = getChain("Stellar_Testnet") as StellarChain;
const USDC = { code: "USDC", issuer: chain.usdcIssuer };
const kit = {} as StellarWalletsKit;

function trustlineEntry(balance: string, limit: string, flags: number) {
  return xdr.LedgerEntryData.trustline(
    new xdr.TrustLineEntry({
      accountId: Keypair.fromPublicKey(ACCOUNT).xdrAccountId(),
      asset: new Asset(USDC.code, USDC.issuer).toTrustLineXDRObject(),
      balance: xdr.Int64.fromString(balance),
      limit: xdr.Int64.fromString(limit),
      flags,
      ext: new xdr.TrustLineEntryExt(0),
    }),
  );
}

function adapterWith(
  getLedgerEntries: (...keys: xdr.LedgerKey[]) => Promise<unknown>,
) {
  const server = { getLedgerEntries } as Pick<
    sorobanRpc.Server,
    "getLedgerEntries"
  > as sorobanRpc.Server;
  return createStellarAdapter(
    kit,
    ACCOUNT,
    stellar({ network: "testnet" }).config,
    server,
  );
}

const AUTHORIZED = xdr.TrustLineFlags.authorizedFlag().value;

describe("createStellarAdapter getTrustline", () => {
  it("reads the account's trustline for the asset from the ledger", async () => {
    const getLedgerEntries = vi.fn(async (key: xdr.LedgerKey) => ({
      latestLedger: 1,
      entries: [
        {
          key,
          val: trustlineEntry("25000000", "9000000000", AUTHORIZED),
          lastModifiedLedgerSeq: 1,
        },
      ],
    }));
    const adapter = adapterWith(getLedgerEntries);
    const line = await adapter.getTrustline!(ACCOUNT, USDC);
    expect(line).toEqual({
      balance: 25_000_000n,
      limit: 9_000_000_000n,
      authorized: true,
    });
    const key = getLedgerEntries.mock.calls[0]![0];
    expect(key.trustLine().asset().toXDR("hex")).toBe(
      new Asset(USDC.code, USDC.issuer).toTrustLineXDRObject().toXDR("hex"),
    );
    expect(key.trustLine().accountId().toXDR("hex")).toBe(
      Keypair.fromPublicKey(ACCOUNT).xdrAccountId().toXDR("hex"),
    );
  });

  it("returns null when the account has no trustline", async () => {
    const adapter = adapterWith(async () => ({ latestLedger: 1, entries: [] }));
    expect(await adapter.getTrustline!(ACCOUNT, USDC)).toBeNull();
  });

  it("reports a trustline without the authorized flag", async () => {
    const adapter = adapterWith(async (key) => ({
      latestLedger: 1,
      entries: [
        { key, val: trustlineEntry("0", "100", 0), lastModifiedLedgerSeq: 1 },
      ],
    }));
    expect(await adapter.getTrustline!(ACCOUNT, USDC)).toMatchObject({
      authorized: false,
    });
  });

  it("throws when the RPC fails, rather than reporting no trustline", async () => {
    const adapter = adapterWith(async () => {
      throw new Error("503 from the RPC");
    });
    await expect(adapter.getTrustline!(ACCOUNT, USDC)).rejects.toBeInstanceOf(
      WhiskError,
    );
  });
});
