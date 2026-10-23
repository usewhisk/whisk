import { Keypair as StellarKeypair, scValToNative } from "@stellar/stellar-sdk";
import { Keypair as SolanaKeypair } from "@solana/web3.js";
import {
  DISCRIMINATOR_DEPOSIT_FOR_BURN,
  DISCRIMINATOR_DEPOSIT_FOR_BURN_WITH_HOOK,
  DISCRIMINATOR_RECEIVE_MESSAGE,
  type SolanaChain,
  type StarknetChain,
  type StellarChain,
} from "@usewhisk/cctp";
import type {
  SolanaAdapter,
  StarknetAdapter,
  StellarAdapter,
} from "../../engine/adapter.js";

type Hex = `0x${string}`;

export type DecodedBurn = {
  amount: bigint;
  destinationDomain: number;
  mintRecipient: Hex;
  destinationCaller: Hex;
  maxFee: bigint;
  minFinalityThreshold: number;
  hookData?: Hex;
};

const hex = (bytes: Uint8Array): Hex =>
  `0x${Buffer.from(bytes).toString("hex")}`;

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** Every account it is asked about exists unless listed in `missing`. */
export function createFakeSolanaWallet(chain: SolanaChain) {
  const address = SolanaKeypair.generate().publicKey.toBase58();
  const burns: DecodedBurn[] = [];
  const mints: Hex[] = [];
  const missing = new Set<string>();
  let signatures = 0;

  const adapter: SolanaAdapter = {
    kind: "solana",
    address,
    async getCluster() {
      return chain.cluster;
    },
    async sendTransaction(instructions) {
      for (const ix of instructions) {
        const data = Uint8Array.from(ix.data);
        const prefix = data.slice(0, 8);
        const program = ix.programId.toBase58();
        if (
          program === chain.tokenMessengerMinter &&
          (sameBytes(prefix, DISCRIMINATOR_DEPOSIT_FOR_BURN) ||
            sameBytes(prefix, DISCRIMINATOR_DEPOSIT_FOR_BURN_WITH_HOOK))
        ) {
          // Borsh: u64 amount, u32 domain, 32-byte recipient and caller,
          // u64 max fee, u32 threshold, then a length-prefixed hook.
          const view = new DataView(data.buffer, data.byteOffset);
          const hookLength = data.length > 96 ? view.getUint32(96, true) : 0;
          burns.push({
            amount: view.getBigUint64(8, true),
            destinationDomain: view.getUint32(16, true),
            mintRecipient: hex(data.slice(20, 52)),
            destinationCaller: hex(data.slice(52, 84)),
            maxFee: view.getBigUint64(84, true),
            minFinalityThreshold: view.getUint32(92, true),
            ...(hookLength > 0 && {
              hookData: hex(data.slice(100, 100 + hookLength)),
            }),
          });
        }
        if (
          program === chain.messageTransmitter &&
          sameBytes(prefix, DISCRIMINATOR_RECEIVE_MESSAGE)
        ) {
          mints.push(hex(data));
        }
      }
      signatures += 1;
      return { signature: `solana-${signatures}` };
    },
    async confirmTransaction() {
      return { status: "success" as const, slot: 1n };
    },
    async getAccountInfo(pubkey) {
      return missing.has(pubkey) ? null : { data: new Uint8Array(165) };
    },
  };
  return { adapter, address, burns, mints, missing };
}

/**
 * Every account it is asked about holds an authorized USDC trustline unless
 * listed in `noTrustline` or `unauthorized`.
 */
export function createFakeStellarWallet(chain: StellarChain) {
  const address = StellarKeypair.random().publicKey();
  const burns: DecodedBurn[] = [];
  const invocations: string[] = [];
  const noTrustline = new Set<string>();
  const unauthorized = new Set<string>();
  const trustlineReads: string[] = [];
  let submitted = 0;

  const adapter: StellarAdapter = {
    kind: "stellar",
    address,
    async getNetwork() {
      return chain.stellarNetwork;
    },
    async submitInvocation(batch) {
      for (const inv of batch) {
        invocations.push(inv.functionName);
        if (inv.functionName.startsWith("deposit_for_burn")) {
          // sender, amount, domain, recipient, burn token, destination caller,
          // max fee, threshold, then the hook when there is one.
          const args = inv.args.map((a) => scValToNative(a) as unknown);
          const hook = args[8] as Buffer | undefined;
          burns.push({
            amount: BigInt(args[1] as bigint),
            destinationDomain: Number(args[2]),
            mintRecipient: hex(args[3] as Buffer),
            destinationCaller: hex(args[5] as Buffer),
            maxFee: BigInt(args[6] as bigint),
            minFinalityThreshold: Number(args[7]),
            ...(hook && { hookData: hex(hook) }),
          });
        }
      }
      submitted += 1;
      return { hashes: batch.map((_, i) => `stellar-${submitted}-${i}`) };
    },
    async confirmTransaction() {
      return { status: "success" as const, ledger: 1 };
    },
    async getLatestLedger() {
      return 1;
    },
    async getTrustline(account, asset) {
      trustlineReads.push(account);
      if (asset.code !== "USDC" || asset.issuer !== chain.usdcIssuer) {
        return null;
      }
      if (noTrustline.has(account)) return null;
      return {
        balance: 0n,
        limit: 9_223_372_036_854_775_807n,
        authorized: !unauthorized.has(account),
      };
    },
  };
  return {
    adapter,
    address,
    burns,
    invocations,
    noTrustline,
    unauthorized,
    trustlineReads,
  };
}

export function createFakeStarknetWallet(chain: StarknetChain) {
  const address = `0x05${"be".repeat(31)}` as Hex;
  const burns: DecodedBurn[] = [];
  const entrypoints: string[] = [];
  let submitted = 0;

  const u256 = (lo: string, hi: string) => (BigInt(hi) << 128n) + BigInt(lo);
  const word = (lo: string, hi: string): Hex =>
    `0x${u256(lo, hi).toString(16).padStart(64, "0")}`;

  const adapter: StarknetAdapter = {
    kind: "starknet",
    address,
    async getChainId() {
      return chain.chainId;
    },
    async submitCalls(calls) {
      for (const call of calls) {
        entrypoints.push(call.entrypoint);
        if (call.entrypoint.startsWith("deposit_for_burn")) {
          // u256 amount, domain, u256 recipient, token, u256 caller,
          // u256 max fee, threshold, then the hook. Only its presence is kept.
          const c = call.calldata;
          burns.push({
            amount: u256(c[0]!, c[1]!),
            destinationDomain: Number(c[2]),
            mintRecipient: word(c[3]!, c[4]!),
            destinationCaller: word(c[6]!, c[7]!),
            maxFee: u256(c[8]!, c[9]!),
            minFinalityThreshold: Number(c[10]),
            ...(c.length > 11 && { hookData: "0x" as Hex }),
          });
        }
      }
      submitted += 1;
      return { hashes: [`0x${submitted.toString(16)}`] };
    },
    async confirmTransaction() {
      return { status: "success" as const, blockNumber: 1 };
    },
  };
  return { adapter, address, burns, entrypoints };
}
