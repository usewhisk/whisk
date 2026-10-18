/**
 * Live testnet sweep — exercises the entire Whisk engine end-to-end
 * against real Circle Iris sandbox + real testnet RPCs.
 *
 * Phases:
 *   1. discover  — read USDC + native balance on every testnet chain
 *   2. send      — self-send 0.01 USDC on each funded chain
 *   3. bridge    — Fast Transfer with Forwarder relay
 *   4. recovery  — Fast Transfer WITHOUT forwarder, then manual mint
 *   5. refund    — bridge + corresponding refund with metadata
 *   6. edges     — input validation: bad amount, bad address, same chain,
 *                  receiver mode, custom merchant fee
 *
 * Reads the signer from `WHISK_LIVE_PK` (0x-prefixed hex, optional 0x).
 * Reads an Alchemy API key from `WHISK_ALCHEMY_KEY` — when set, every
 * supported chain routes through Alchemy's RPC instead of the public
 * defaults. Never logs the key.
 *
 * Run:
 *   WHISK_LIVE_PK=... WHISK_ALCHEMY_KEY=... pnpm --filter @usewhisk/core test:live
 *   pnpm --filter @usewhisk/core test:live -- --phase=bridge
 *   pnpm --filter @usewhisk/core test:live -- --pairs=BaseSepolia>EthereumSepolia
 *   pnpm --filter @usewhisk/core test:live -- --phase=recovery
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Chain as ViemChain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { nonceManager, privateKeyToAccount } from "viem/accounts";
import {
  arbitrumSepolia,
  avalancheFuji,
  baseSepolia,
  lineaSepolia,
  optimismSepolia,
  polygonAmoy,
  sepolia,
  unichainSepolia,
  worldchainSepolia,
} from "viem/chains";
import bs58 from "bs58";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  type Commitment,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import {
  Asset,
  BASE_FEE,
  Keypair as StellarKeypair,
  Networks,
  Operation as StellarOp,
  TransactionBuilder as StellarTxBuilder,
  rpc as sorobanRpc,
} from "@stellar/stellar-sdk";
import {
  Account as StarknetAccount,
  RpcProvider as StarknetRpcProvider,
  uint256 as starknetU256,
} from "starknet";
import {
  buildBurnIntent,
  buildMintIntent,
  pollMessages,
  SolanaDevnet,
  StarknetSepolia,
  StellarTestnet,
  getChain,
  usdcAbi,
  type BurnFeeTier,
  type CctpChain,
  type EvmAdapter,
  type EvmCall,
  type SolanaChain,
  type SolanaInstruction,
  type StarknetCall,
  type StarknetChain,
  type StellarChain,
  type StellarInvocation,
} from "@usewhisk/cctp";
import { createWhisk } from "../src/engine/createWhisk.js";
import { buildBridgeQuote } from "../src/engine/bridge/quote.js";
import type {
  SolanaAdapter,
  StarknetAdapter,
  StellarAdapter,
  WhiskEngine,
} from "../src/engine/types.js";
import type { Chain as WhiskChain } from "../src/types/chain.js";

// ---------------------------------------------------------------------- //
//  Setup
// ---------------------------------------------------------------------- //

const PK_RAW = process.env["WHISK_LIVE_PK"];
if (!PK_RAW) {
  console.error(
    "WHISK_LIVE_PK env var is required. Pass a 32-byte hex testnet private key (0x prefix optional).",
  );
  process.exit(1);
}
const PK: Hex = PK_RAW.startsWith("0x")
  ? (PK_RAW as Hex)
  : (`0x${PK_RAW}` as Hex);
const ALCHEMY_KEY = process.env["WHISK_ALCHEMY_KEY"];
const HELIUS_KEY = process.env["WHISK_HELIUS_KEY"];
const SOLANA_PK_RAW = process.env["WHISK_SOLANA_PK"];
const STELLAR_SEED_RAW = process.env["WHISK_STELLAR_SEED"];
const STARKNET_ADDRESS_RAW = process.env["WHISK_STARKNET_ADDRESS"];
const STARKNET_PK_RAW = process.env["WHISK_STARKNET_PK"];
const STARKNET_RPC_RAW = process.env["WHISK_STARKNET_RPC"];
const account = privateKeyToAccount(PK, { nonceManager });

let solanaKeypair: Keypair | null = null;
let solanaConnection: Connection | null = null;
if (SOLANA_PK_RAW) {
  try {
    solanaKeypair = Keypair.fromSecretKey(bs58.decode(SOLANA_PK_RAW));
  } catch (err) {
    console.error(
      `WHISK_SOLANA_PK: failed to decode as base58 ed25519 secret key (${(err as Error).message})`,
    );
    process.exit(1);
  }
  const solanaEndpoint = HELIUS_KEY
    ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
    : SolanaDevnet.defaultRpcUrls[0]!;
  solanaConnection = new Connection(solanaEndpoint, "confirmed");
}

let stellarKeypair: StellarKeypair | null = null;
let stellarRpc: sorobanRpc.Server | null = null;
if (STELLAR_SEED_RAW) {
  try {
    stellarKeypair = StellarKeypair.fromSecret(STELLAR_SEED_RAW);
  } catch (err) {
    console.error(
      `WHISK_STELLAR_SEED: failed to load (${(err as Error).message})`,
    );
    process.exit(1);
  }
  stellarRpc = new sorobanRpc.Server(StellarTestnet.defaultRpcUrls[0]!);
}

let starknetAccount: StarknetAccount | null = null;
let starknetProvider: StarknetRpcProvider | null = null;
if (STARKNET_ADDRESS_RAW && STARKNET_PK_RAW) {
  try {
    // Explicit override wins; otherwise Alchemy (Blast is deprecated);
    // otherwise the chain registry default.
    const starknetRpcUrl =
      STARKNET_RPC_RAW ??
      (ALCHEMY_KEY
        ? `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/${ALCHEMY_KEY}`
        : StarknetSepolia.defaultRpcUrls[0]!);
    starknetProvider = new StarknetRpcProvider({ nodeUrl: starknetRpcUrl });
    starknetAccount = new StarknetAccount(
      starknetProvider,
      STARKNET_ADDRESS_RAW,
      STARKNET_PK_RAW,
    );
  } catch (err) {
    console.error(
      `WHISK_STARKNET_ADDRESS/PK: failed to load (${(err as Error).message})`,
    );
    process.exit(1);
  }
}

console.log(`EVM signer:    ${account.address}`);
if (solanaKeypair) {
  console.log(`Solana signer: ${solanaKeypair.publicKey.toBase58()}`);
}
if (stellarKeypair) {
  console.log(`Stellar signer: ${stellarKeypair.publicKey()}`);
}
if (starknetAccount) {
  console.log(`Starknet signer: ${starknetAccount.address}`);
}
console.log(
  `Alchemy: ${ALCHEMY_KEY ? "enabled" : "disabled — using public RPCs"}`,
);
console.log(
  `Helius:  ${HELIUS_KEY ? "enabled" : "disabled — using public Devnet RPC"}`,
);

// Per-chain Alchemy slug. Maps CctpChain.id → the subdomain prefix
// Alchemy uses. Chains without a known prefix fall back to the
// CctpChain's `defaultRpcUrls[0]`. Avalanche Fuji + WorldChain Sepolia
// are absent here because Alchemy gated those subdomains on a higher
// plan; public RPCs handle both fine.
const ALCHEMY_PREFIX: Record<string, string> = {
  Ethereum_Sepolia: "eth-sepolia",
  Optimism_Sepolia: "opt-sepolia",
  Arbitrum_Sepolia: "arb-sepolia",
  Base_Sepolia: "base-sepolia",
  Polygon_Amoy_Testnet: "polygon-amoy",
  Unichain_Sepolia: "unichain-sepolia",
  Linea_Sepolia: "linea-sepolia",
};

function rpcUrlFor(chain: CctpChain): string {
  if (ALCHEMY_KEY) {
    const prefix = ALCHEMY_PREFIX[chain.id];
    if (prefix) return `https://${prefix}.g.alchemy.com/v2/${ALCHEMY_KEY}`;
  }
  const fallback = chain.defaultRpcUrls[0];
  if (!fallback) {
    throw new Error(`No RPC URL configured for ${chain.id}`);
  }
  return fallback;
}

const VIEM_CHAIN: Record<string, ViemChain> = {
  Ethereum_Sepolia: sepolia,
  Avalanche_Fuji: avalancheFuji,
  Optimism_Sepolia: optimismSepolia,
  Arbitrum_Sepolia: arbitrumSepolia,
  Base_Sepolia: baseSepolia,
  Polygon_Amoy_Testnet: polygonAmoy,
  Unichain_Sepolia: unichainSepolia,
  Linea_Sepolia: lineaSepolia,
  World_Chain_Sepolia: worldchainSepolia,
};

// The chains this script has wallets and viem configs for.
const LIVE_CHAINS: WhiskChain[] = [
  "Ethereum_Sepolia",
  "Avalanche_Fuji",
  "Optimism_Sepolia",
  "Arbitrum_Sepolia",
  "Base_Sepolia",
  "Polygon_Amoy_Testnet",
  "Unichain_Sepolia",
  "Linea_Sepolia",
  "World_Chain_Sepolia",
  "Solana_Devnet",
  "Stellar_Testnet",
  "Starknet_Sepolia",
];
const NATIVE_SYMBOL: Record<number, string> = {
  43113: "AVAX",
  80002: "MATIC",
};

function buildClients(chain: CctpChain): {
  publicClient: PublicClient;
  walletClient: WalletClient;
  viemChain: ViemChain;
} {
  if (chain.ecosystem !== "evm") {
    throw new Error(
      `buildClients: ${chain.id} is not EVM (use Solana branch instead)`,
    );
  }
  const viemChain = VIEM_CHAIN[chain.id];
  if (!viemChain) throw new Error(`No viem chain for ${chain.id}`);
  const transport = http(rpcUrlFor(chain));
  const publicClient = createPublicClient({
    chain: viemChain,
    transport,
  }) as unknown as PublicClient;
  const walletClient = createWalletClient({
    chain: viemChain,
    transport,
    account,
  });
  return { publicClient, walletClient, viemChain };
}

function makeSolanaNodeAdapter(chain: SolanaChain): SolanaAdapter {
  if (!solanaKeypair || !solanaConnection) {
    throw new Error(
      "Solana node adapter requires WHISK_SOLANA_PK + Solana connection",
    );
  }
  const keypair = solanaKeypair;
  const connection = solanaConnection;
  const cluster: "mainnet-beta" | "devnet" =
    chain.cluster === "mainnet-beta" ? "mainnet-beta" : "devnet";

  return {
    kind: "solana",
    address: keypair.publicKey.toBase58(),

    async getCluster() {
      return cluster;
    },

    async sendTransaction(instructions: SolanaInstruction[], options) {
      const tx = new Transaction();
      for (const ix of instructions) {
        tx.add(
          new TransactionInstruction({
            programId: new PublicKey(ix.programId),
            keys: ix.keys.map((k) => ({
              pubkey: new PublicKey(k.pubkey),
              isSigner: k.isSigner,
              isWritable: k.isWritable,
            })),
            data: Buffer.from(ix.data),
          }),
        );
      }
      tx.feePayer = keypair.publicKey;
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;

      const signers = [keypair];
      if (options?.extraSigners) {
        for (const s of options.extraSigners) {
          signers.push(Keypair.fromSecretKey(s.secretKey));
        }
      }
      tx.sign(...signers);

      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed" as Commitment,
      });
      return { signature };
    },

    async confirmTransaction(signature) {
      const result = await connection.confirmTransaction(
        signature,
        "confirmed",
      );
      return {
        status: result.value.err ? "reverted" : "success",
        slot: 0n,
      };
    },

    async getAccountInfo(pubkey) {
      const info = await connection.getAccountInfo(
        new PublicKey(pubkey),
        "confirmed",
      );
      if (!info) return null;
      return { data: new Uint8Array(info.data) };
    },
  };
}

function makeStellarNodeAdapter(chain: StellarChain): StellarAdapter {
  if (!stellarKeypair || !stellarRpc) {
    throw new Error(
      "Stellar node adapter requires WHISK_STELLAR_SEED + RPC connection",
    );
  }
  const keypair = stellarKeypair;
  const rpcServer = stellarRpc;
  const networkPassphrase = chain.networkPassphrase;
  const stellarNetwork: "public" | "testnet" =
    chain.stellarNetwork === "public" ? "public" : "testnet";

  return {
    kind: "stellar",
    address: keypair.publicKey(),

    async getNetwork() {
      return stellarNetwork;
    },

    async submitInvocation(invocations: StellarInvocation[]) {
      const hashes: string[] = [];
      for (const inv of invocations) {
        // Reload account each time so the sequence number is fresh.
        const sourceAccount = await rpcServer.getAccount(keypair.publicKey());
        const baseTx = new StellarTxBuilder(sourceAccount, {
          fee: BASE_FEE,
          networkPassphrase,
        })
          .addOperation(inv.operation)
          .setTimeout(180)
          .build();
        const sim = await rpcServer.simulateTransaction(baseTx);
        if (sorobanRpc.Api.isSimulationError(sim)) {
          throw new Error(
            `Stellar simulation error (${inv.functionName}): ${sim.error}`,
          );
        }
        const assembled = sorobanRpc.assembleTransaction(baseTx, sim).build();
        assembled.sign(keypair);
        const sendResponse = await rpcServer.sendTransaction(assembled);
        if (sendResponse.status !== "PENDING") {
          throw new Error(
            `Stellar submit failed (${inv.functionName}): ${sendResponse.status} ${JSON.stringify(sendResponse.errorResult ?? {})}`,
          );
        }
        hashes.push(sendResponse.hash);
        // Wait for THIS tx to land before submitting the next, otherwise
        // the approve→burn ordering races.
        const deadline = Date.now() + 60_000;
        let landed = false;
        while (Date.now() < deadline) {
          const status = await rpcServer.getTransaction(sendResponse.hash);
          if (status.status === sorobanRpc.Api.GetTransactionStatus.SUCCESS) {
            landed = true;
            break;
          }
          if (status.status === sorobanRpc.Api.GetTransactionStatus.FAILED) {
            throw new Error(
              `Stellar tx ${sendResponse.hash} reverted (${inv.functionName}): ${JSON.stringify(status.resultXdr ?? "")}`,
            );
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (!landed) {
          throw new Error(
            `Stellar tx ${sendResponse.hash} did not land in 60s (${inv.functionName})`,
          );
        }
      }
      return { hashes };
    },

    async confirmTransaction(hash: string) {
      // Poll up to ~30 s; Stellar finalizes in 5-7 s typically.
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const status = await rpcServer.getTransaction(hash);
        if (status.status === sorobanRpc.Api.GetTransactionStatus.SUCCESS) {
          return { status: "success" as const, ledger: status.ledger };
        }
        if (status.status === sorobanRpc.Api.GetTransactionStatus.FAILED) {
          return {
            status: "reverted" as const,
            ledger: status.ledger ?? 0,
          };
        }
        // NOT_FOUND or pending — wait and retry.
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error(`Stellar tx ${hash} did not confirm within 60s.`);
    },

    async getLatestLedger() {
      const info = await rpcServer.getLatestLedger();
      return info.sequence;
    },
  };
}

function makeStarknetNodeAdapter(chain: StarknetChain): StarknetAdapter {
  if (!starknetAccount || !starknetProvider) {
    throw new Error(
      "Starknet node adapter requires WHISK_STARKNET_ADDRESS + WHISK_STARKNET_PK",
    );
  }
  const account = starknetAccount;
  const provider = starknetProvider;

  return {
    kind: "starknet",
    address: account.address,

    async getChainId() {
      const chainId = await provider.getChainId();
      return chainId;
    },

    async submitCalls(calls: StarknetCall[]) {
      // Starknet.js Account.execute() calls getNonce(pending) internally,
      // and Alchemy v0_10 rejects `pending`. Fetch nonce with `latest`
      // and pass it explicitly.
      const nonce = await provider.getNonceForAddress(
        account.address,
        "latest",
      );
      const result = await account.execute(
        calls.map((c) => ({
          contractAddress: c.contractAddress,
          entrypoint: c.entrypoint,
          calldata: c.calldata,
        })),
        { nonce, version: 3 },
      );
      return { hashes: [result.transaction_hash] };
    },

    async confirmTransaction(hash: string) {
      const receipt = await provider.waitForTransaction(hash, {
        retryInterval: 3000,
      });
      const status =
        "isSuccess" in receipt && receipt.isSuccess() ? "success" : "reverted";
      const blockNumber =
        (receipt as { block_number?: number }).block_number ?? 0;
      return { status: status as "success" | "reverted", blockNumber };
    },
  };
  void chain;
}

function makeNodeAdapter(chain: CctpChain): EvmAdapter {
  const { publicClient, walletClient } = buildClients(chain);
  return {
    kind: "evm",
    address: account.address,
    async getChainId() {
      return chain.evmChainId;
    },
    async switchChain(targetChainId) {
      if (targetChainId !== chain.evmChainId) {
        throw new Error(
          `Node adapter is pinned to ${chain.id} (${chain.evmChainId}); cannot switch to ${targetChainId}.`,
        );
      }
    },
    async sendCalls(calls: EvmCall[]) {
      const hashes: `0x${string}`[] = [];
      for (let i = 0; i < calls.length; i++) {
        const call = calls[i]!;
        const hash = await walletClient.sendTransaction({
          to: call.to,
          data: call.data,
          value: call.value,
          account: walletClient.account!,
          chain: walletClient.chain,
        });
        hashes.push(hash);
        // Wait per call; CCTP requires approve to be mined before burn.
        // 2 confirmations are belt-and-suspenders against any RPC state
        // lag (Alchemy is usually fine with 1, but cost is negligible).
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

// ---------------------------------------------------------------------- //
//  Discovery
// ---------------------------------------------------------------------- //

type BalanceRow = {
  chain: CctpChain;
  whiskChain: WhiskChain | undefined;
  usdc: bigint;
  native: bigint;
  ok: boolean;
  hint: string;
};

const USDC_UNIT = 10n ** 6n;

async function discover(): Promise<{
  rows: BalanceRow[];
  byName: Map<string, BalanceRow>;
}> {
  console.log("\n── Phase 1: discover balances ──");
  const rows: BalanceRow[] = [];
  for (const whiskChain of LIVE_CHAINS) {
    const chain = getChain(whiskChain);
    if (chain.ecosystem === "solana") {
      rows.push(await discoverSolana(chain, whiskChain));
    } else if (chain.ecosystem === "evm") {
      rows.push(await discoverEvm(chain, whiskChain));
    }
  }
  if (stellarKeypair) {
    rows.push(await discoverStellar(StellarTestnet, StellarTestnet.id));
  }
  if (starknetAccount) {
    rows.push(await discoverStarknet(StarknetSepolia, StarknetSepolia.id));
  }

  for (const r of rows) {
    const status = r.ok ? "OK " : "ERR";
    const sym =
      r.chain.ecosystem === "solana"
        ? "SOL"
        : r.chain.ecosystem === "stellar"
          ? "XLM"
          : r.chain.ecosystem === "starknet"
            ? "ETH"
            : (NATIVE_SYMBOL[
                (r.chain as { evmChainId?: number }).evmChainId ?? 0
              ] ?? "ETH");
    console.log(
      `  ${status}  ${r.chain.id.padEnd(20)}  ${fmtUsdc(r.usdc).padStart(12)} USDC  ${fmtNative(r.native, r.chain.ecosystem).padStart(10)} ${sym}  ${r.hint}`,
    );
  }
  const byName = new Map(rows.map((r) => [r.chain.id, r]));
  return { rows, byName };
}

async function discoverEvm(
  chain: CctpChain,
  whiskChain: WhiskChain | undefined,
): Promise<BalanceRow> {
  let usdc = 0n;
  let native = 0n;
  let ok = false;
  let hint = "";
  try {
    const { publicClient } = buildClients(chain);
    [usdc, native] = await Promise.all([
      publicClient.readContract({
        address: chain.usdc as Address,
        abi: usdcAbi,
        functionName: "balanceOf",
        args: [account.address],
      }) as Promise<bigint>,
      publicClient.getBalance({ address: account.address }),
    ]);
    ok = true;
  } catch (err) {
    hint = err instanceof Error ? err.message.slice(0, 80) : String(err);
  }
  return { chain, whiskChain, usdc, native, ok, hint };
}

async function discoverSolana(
  chain: SolanaChain,
  whiskChain: WhiskChain | undefined,
): Promise<BalanceRow> {
  if (!solanaKeypair || !solanaConnection) {
    return {
      chain,
      whiskChain,
      usdc: 0n,
      native: 0n,
      ok: false,
      hint: "WHISK_SOLANA_PK not set — skipping Solana",
    };
  }
  let usdc = 0n;
  let native = 0n;
  let ok = false;
  let hint = "";
  try {
    const mint = new PublicKey(chain.usdc);
    const ata = getAssociatedTokenAddressSync(mint, solanaKeypair.publicKey);
    native = BigInt(
      await solanaConnection.getBalance(solanaKeypair.publicKey, "confirmed"),
    );
    try {
      const acc = await getAccount(solanaConnection, ata, "confirmed");
      usdc = acc.amount;
    } catch {
      // ATA may not exist yet — that's "0 USDC", not an error.
      usdc = 0n;
    }
    ok = true;
  } catch (err) {
    hint = err instanceof Error ? err.message.slice(0, 80) : String(err);
  }
  return { chain, whiskChain, usdc, native, ok, hint };
}

async function discoverStellar(
  chain: StellarChain,
  whiskChain: WhiskChain | undefined,
): Promise<BalanceRow> {
  if (!stellarKeypair) {
    return {
      chain,
      whiskChain,
      usdc: 0n,
      native: 0n,
      ok: false,
      hint: "WHISK_STELLAR_SEED not set",
    };
  }
  let usdc = 0n;
  let native = 0n;
  let ok = false;
  let hint = "";
  try {
    // Horizon testnet provides account balances directly.
    const horizonUrl = `https://horizon-testnet.stellar.org/accounts/${stellarKeypair.publicKey()}`;
    const res = await fetch(horizonUrl);
    if (res.status === 404) {
      hint = "account not funded (friendbot first)";
      return { chain, whiskChain, usdc, native, ok, hint };
    }
    if (!res.ok) {
      hint = `horizon ${res.status}`;
      return { chain, whiskChain, usdc, native, ok, hint };
    }
    const json = (await res.json()) as {
      balances?: Array<{
        asset_type: string;
        asset_code?: string;
        asset_issuer?: string;
        balance: string;
      }>;
    };
    for (const b of json.balances ?? []) {
      const stroops = BigInt(Math.round(parseFloat(b.balance) * 10_000_000));
      if (b.asset_type === "native") native = stroops;
      else if (b.asset_code === "USDC" && b.asset_issuer === chain.usdcIssuer) {
        // Convert Stellar's 7-decimal USDC to 6-decimal canonical for the
        // shared `fmtUsdc` formatter.
        usdc = stroops / 10n;
      }
    }
    ok = true;
  } catch (err) {
    hint = err instanceof Error ? err.message.slice(0, 80) : String(err);
  }
  return { chain, whiskChain, usdc, native, ok, hint };
}

async function discoverStarknet(
  chain: StarknetChain,
  whiskChain: WhiskChain | undefined,
): Promise<BalanceRow> {
  if (!starknetAccount || !starknetProvider) {
    return {
      chain,
      whiskChain,
      usdc: 0n,
      native: 0n,
      ok: false,
      hint: "WHISK_STARKNET_ADDRESS/PK not set",
    };
  }
  let usdc = 0n;
  let native = 0n;
  let ok = false;
  let hint = "";
  try {
    // USDC balance via SNIP-2 `balanceOf`. Pin to `latest` because
    // some RPC providers (Alchemy v0_10) reject `pending`.
    const result = await starknetProvider.callContract(
      {
        contractAddress: chain.usdc,
        entrypoint: "balanceOf",
        calldata: [starknetAccount.address],
      },
      "latest",
    );
    if (Array.isArray(result) && result.length >= 2) {
      const raw = starknetU256.uint256ToBN({
        low: result[0]!,
        high: result[1]!,
      });
      usdc = BigInt(raw.toString());
    }
    ok = true;
  } catch (err) {
    hint = err instanceof Error ? err.message.slice(0, 80) : String(err);
  }
  return { chain, whiskChain, usdc, native, ok, hint };
}

function fmtNative(
  amount: bigint,
  ecosystem: "evm" | "solana" | "stellar" | "starknet",
): string {
  if (amount === 0n) return "0";
  // EVM: 18 decimals; Solana SOL: 9 decimals; Stellar XLM: 7 decimals;
  // Starknet ETH: 18 decimals (STRK also 18).
  const decimals =
    ecosystem === "solana" ? 9 : ecosystem === "stellar" ? 7 : 18;
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  const fracStr = frac
    .toString()
    .padStart(decimals, "0")
    .slice(0, 6)
    .replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

function fmtUsdc(subunits: bigint): string {
  if (subunits === 0n) return "0";
  const whole = subunits / USDC_UNIT;
  const frac = subunits % USDC_UNIT;
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

function fmtEth(wei: bigint): string {
  if (wei === 0n) return "0";
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  const fracStr = frac
    .toString()
    .padStart(18, "0")
    .slice(0, 6)
    .replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

function shortHash(hash: string): string {
  return hash ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : "(none)";
}

// ---------------------------------------------------------------------- //
//  Phase 2 — Same-chain Send (every funded chain)
// ---------------------------------------------------------------------- //

const SEND_AMOUNT = "0.01";

async function sweepSameChain(
  engine: WhiskEngine,
  rows: BalanceRow[],
): Promise<void> {
  console.log("\n── Phase 2: same-chain self-send (0.01 USDC each) ──");
  const fundable = rows.filter(
    (r) => r.ok && r.whiskChain && r.usdc >= 10_000n && r.native > 0n,
  );
  const skipped = rows.filter(
    (r) => r.ok && (!(r.usdc >= 10_000n) || r.native === 0n),
  );
  if (fundable.length === 0) {
    console.log("  (no chain has both USDC and native gas — skipping)");
    return;
  }
  for (const row of fundable) {
    if (!row.whiskChain) continue;
    const adapter =
      row.chain.ecosystem === "solana"
        ? makeSolanaNodeAdapter(row.chain)
        : makeNodeAdapter(row.chain);
    const recipientAddress =
      row.chain.ecosystem === "solana"
        ? solanaKeypair!.publicKey.toBase58()
        : account.address;
    process.stdout.write(`  ${row.chain.id.padEnd(20)} `);
    try {
      const quote = await engine.quote({
        sourceChain: row.whiskChain,
        destinationChain: row.whiskChain,
        recipient: { address: recipientAddress, chain: row.whiskChain },
        amount: SEND_AMOUNT,
        adapter,
      });
      const result = await engine.send({
        sourceChain: row.whiskChain,
        destinationChain: row.whiskChain,
        recipient: { address: recipientAddress, chain: row.whiskChain },
        amount: SEND_AMOUNT,
        adapter,
        quote,
      });
      if (result.kind === "success") {
        console.log(`OK   tx=${shortHash(result.finalTxHash ?? "")}`);
      } else {
        console.log(`FAIL  ${result.error.message.slice(0, 90)}`);
      }
    } catch (err) {
      console.log(
        `THROW ${(err instanceof Error ? err.message : String(err)).slice(0, 90)}`,
      );
    }
  }
  for (const r of skipped) {
    const reason =
      r.usdc < 10_000n ? "no USDC" : r.native === 0n ? "no native gas" : "?";
    console.log(`  ${r.chain.id.padEnd(20)} SKIP (${reason})`);
  }
}

// ---------------------------------------------------------------------- //
//  Phase 3 — Bridge (Forwarder happy path)
// ---------------------------------------------------------------------- //

const BRIDGE_AMOUNT = "0.05";

// Pairs chosen to cover distinct source chains + distinct destination
// domains. Bridge runs only fire when the source has both USDC and
// native gas; pairs whose source lacks gas just print SKIP and move on.
const DEFAULT_BRIDGE_PAIRS: ReadonlyArray<[string, string]> = [
  ["Base_Sepolia", "Optimism_Sepolia"],
  ["Base_Sepolia", "Arbitrum_Sepolia"],
  ["Ethereum_Sepolia", "Base_Sepolia"],
  ["Ethereum_Sepolia", "Arbitrum_Sepolia"],
  ["Avalanche_Fuji", "Base_Sepolia"],
  ["Polygon_Amoy_Testnet", "Ethereum_Sepolia"],
];

function pairsFromArg(): ReadonlyArray<[string, string]> {
  const flag = process.argv
    .find((a) => a.startsWith("--pairs="))
    ?.slice("--pairs=".length);
  if (!flag) return DEFAULT_BRIDGE_PAIRS;
  return flag.split(",").map((p) => {
    const [src, dst] = p.split(">");
    return [src ?? "", dst ?? ""] as [string, string];
  });
}

async function sweepBridge(
  engine: WhiskEngine,
  byName: Map<string, BalanceRow>,
): Promise<void> {
  console.log("\n── Phase 3: cross-chain bridge (Forwarder) ──");
  for (const [srcName, dstName] of pairsFromArg()) {
    const src = byName.get(srcName);
    const dst = byName.get(dstName);
    if (!src || !dst || !src.whiskChain || !dst.whiskChain) {
      console.log(`  ${srcName} → ${dstName}: skip (chain not found)`);
      continue;
    }
    if (!src.ok || src.usdc < 100_000n || src.native === 0n) {
      const reason = !src.ok
        ? "RPC err"
        : src.usdc < 100_000n
          ? "low USDC"
          : "no native";
      console.log(`  ${srcName} → ${dstName}: skip (${reason})`);
      continue;
    }
    const adapter = makeNodeAdapter(src.chain);
    process.stdout.write(`  ${srcName} → ${dstName}  `);
    try {
      const quote = await engine.quote({
        sourceChain: src.whiskChain,
        destinationChain: dst.whiskChain,
        recipient: { address: account.address, chain: dst.whiskChain },
        amount: BRIDGE_AMOUNT,
        adapter,
      });
      process.stdout.write(
        `quote(in=${quote.amountIn},out=${quote.amountOut})  `,
      );
      const result = await engine.send({
        sourceChain: src.whiskChain,
        destinationChain: dst.whiskChain,
        recipient: { address: account.address, chain: dst.whiskChain },
        amount: BRIDGE_AMOUNT,
        adapter,
        quote,
      });
      if (result.kind === "success") {
        const mint = result.steps.find((s) => s.name === "mint");
        const burn = result.steps.find((s) => s.name === "burn");
        console.log(
          `OK   burn=${shortHash(burn?.txHash ?? "")} mint=${shortHash(result.finalTxHash ?? "")} fwd=${mint?.forwarded}`,
        );
      } else {
        const stepName = result.steps.find((s) => s.state === "error")?.name;
        console.log(
          `FAIL on=${stepName}  ${result.error.message.slice(0, 90)}`,
        );
      }
    } catch (err) {
      console.log(
        `THROW ${(err instanceof Error ? err.message : String(err)).slice(0, 90)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------- //
//  Phase 4 — Recovery (no forwarder → manual mint)
// ---------------------------------------------------------------------- //

const RECOVERY_AMOUNT = "0.10";

async function sweepRecovery(byName: Map<string, BalanceRow>): Promise<void> {
  console.log("\n── Phase 4: recovery (forwarder OFF, manual mint) ──");

  // Base → Eth: both have native gas, so the recovery path's manual
  // mint on the destination can actually land.
  const srcName = "Base_Sepolia";
  const dstName = "Ethereum_Sepolia";
  const src = byName.get(srcName);
  const dst = byName.get(dstName);
  if (!src?.whiskChain || !dst?.whiskChain) {
    console.log("  skip (Base/Arb Sepolia not found)");
    return;
  }
  if (src.usdc < 200_000n || src.native === 0n) {
    console.log(`  skip — need USDC + native on ${srcName}`);
    return;
  }
  if (dst.native === 0n) {
    console.log(
      `  skip — manual mint needs native gas on ${dstName}; faucet first`,
    );
    return;
  }
  const srcAdapter = makeNodeAdapter(src.chain);
  const dstAdapter = makeNodeAdapter(dst.chain);

  process.stdout.write(`  ${srcName} → ${dstName} (manual mint)  `);
  try {
    // 1. Build the no-forwarder burn quote so maxFee accounts for the
    //    absent forwarder fee.
    const bridge = await buildBridgeQuote({
      network: "testnet",
      source: src.chain,
      destination: dst.chain,
      sourceChain: src.whiskChain,
      destinationChain: dst.whiskChain,
      recipient: { address: account.address, chain: dst.whiskChain },
      amount: RECOVERY_AMOUNT,
      feeBearer: "sender",
      useForwarder: false,
    });

    // 2. Submit the burn via the source adapter (no hookData).
    const intent = buildBurnIntent({
      source: src.chain,
      destination: dst.chain,
      amount: bridge.burnAmount,
      mintRecipient: account.address,
      withForwarder: false,
      fee: { tier: bridge.tier },
    });
    const { hashes } = await srcAdapter.sendCalls(intent.calls);
    const burnHash = hashes[hashes.length - 1]!;
    process.stdout.write(`burn=${shortHash(burnHash)}  `);

    // 3. Poll Iris for the attestation. With forwarder off, the
    //    terminal state is `status: complete` (not `forwardState`).
    //    Sepolia attestation can be slow on testnet — give it 30 min.
    const message = await pollMessages(
      { sourceDomain: src.chain.cctpDomain, transactionHash: burnHash },
      { network: "testnet", intervalMs: 10_000, timeoutMs: 30 * 60 * 1000 },
    );
    if (!message || message.status !== "complete") {
      console.log(
        `FAIL attestation never landed (status=${message?.status ?? "none"})`,
      );
      return;
    }
    process.stdout.write(`attested  `);

    // 4. Build the manual mint calldata and submit on the destination.
    const mint = buildMintIntent({
      destination: dst.chain,
      message: message.message,
      attestation: message.attestation,
    });
    const { hashes: mintHashes } = await dstAdapter.sendCalls([mint.call]);
    const mintHash = mintHashes[mintHashes.length - 1]!;
    console.log(`mint=${shortHash(mintHash)}  OK`);
  } catch (err) {
    console.log(
      `THROW ${(err instanceof Error ? err.message : String(err)).slice(0, 100)}`,
    );
  }
}

// ---------------------------------------------------------------------- //
//  Phase 5 — Refund
// ---------------------------------------------------------------------- //

async function sweepRefund(
  engine: WhiskEngine,
  byName: Map<string, BalanceRow>,
): Promise<void> {
  console.log("\n── Phase 5: refund ──");

  // Same-chain refund: send 0.05 from A → A, then refund A → A. The
  // merchant adapter is the same wallet (loopback) so we can verify
  // metadata stamping without needing a second signer.
  const chain = byName.get("Base_Sepolia");
  if (!chain?.whiskChain || chain.usdc < 100_000n || chain.native === 0n) {
    console.log("  skip — Base Sepolia needs USDC + native gas");
    return;
  }
  const adapter = makeNodeAdapter(chain.chain);
  process.stdout.write(`  Base Sepolia loopback  `);
  try {
    const send = await engine.send({
      sourceChain: chain.whiskChain,
      destinationChain: chain.whiskChain,
      recipient: { address: account.address, chain: chain.whiskChain },
      amount: "0.05",
      adapter,
      // @ts-expect-error — engine doesn't read the quote on same-chain
      quote: {},
    });
    if (send.kind !== "success" || !send.finalTxHash) {
      console.log(
        `FAIL send  ${send.kind === "failure" ? send.error.message : "no hash"}`,
      );
      return;
    }
    process.stdout.write(`send=${shortHash(send.finalTxHash)}  `);

    const refund = await engine.refund({
      originalTxHash: send.finalTxHash,
      originalDestinationChain: chain.whiskChain,
      refundDestinationChain: chain.whiskChain,
      originalSenderAddress: account.address,
      amount: "0.05",
      reason: "test_refund_loopback",
      merchantAdapter: adapter,
    });
    if (refund.kind !== "success") {
      console.log(`FAIL refund  ${refund.error.message.slice(0, 80)}`);
      return;
    }
    const hasRefundMeta =
      refund.metadata?.["__refundOfTxHash"] === send.finalTxHash &&
      refund.metadata?.["__refundReason"] === "test_refund_loopback";
    console.log(
      `refund=${shortHash(refund.finalTxHash ?? "")}  meta=${hasRefundMeta ? "✓" : "✗"}  OK`,
    );
  } catch (err) {
    console.log(
      `THROW ${(err instanceof Error ? err.message : String(err)).slice(0, 100)}`,
    );
  }
}

// ---------------------------------------------------------------------- //
//  Phase 6 — Edges
// ---------------------------------------------------------------------- //

async function sweepEdges(
  engine: WhiskEngine,
  byName: Map<string, BalanceRow>,
): Promise<void> {
  console.log("\n── Phase 6: edge cases ──");
  const base = byName.get("Base_Sepolia");
  if (!base?.whiskChain || base.usdc < 1_000n) {
    console.log("  skip — Base Sepolia needs USDC for fixture quotes");
    return;
  }
  const adapter = makeNodeAdapter(base.chain);

  // 6.1 — Quote rejects invalid recipient address
  process.stdout.write("  invalid recipient address          ");
  try {
    await engine.quote({
      sourceChain: base.whiskChain,
      destinationChain: base.whiskChain,
      recipient: { address: "not-an-address", chain: base.whiskChain },
      amount: "0.01",
      adapter,
    });
    console.log("FAIL  (quote did not throw)");
  } catch (err) {
    console.log(`OK    threw "${(err as Error).message.slice(0, 60)}"`);
  }

  // 6.2 — Quote rejects zero amount
  process.stdout.write("  zero amount                        ");
  try {
    await engine.quote({
      sourceChain: base.whiskChain,
      destinationChain: base.whiskChain,
      recipient: { address: account.address, chain: base.whiskChain },
      amount: "0",
      adapter,
    });
    // Same-chain quote with "0" doesn't error in quote — it errors on
    // submit where parseUsdcAmount rejects "<= 0".
    const result = await engine.send({
      sourceChain: base.whiskChain,
      destinationChain: base.whiskChain,
      recipient: { address: account.address, chain: base.whiskChain },
      amount: "0",
      adapter,
      // @ts-expect-error — quote not read on same-chain path
      quote: {},
    });
    if (result.kind === "failure") {
      console.log(
        `OK    send rejected ("${result.error.message.slice(0, 50)}")`,
      );
    } else {
      console.log("FAIL  (sent zero amount)");
    }
  } catch (err) {
    console.log(`OK    threw "${(err as Error).message.slice(0, 60)}"`);
  }

  // 6.3 — Bridge with feeBearer="receiver" yields a smaller amountOut
  process.stdout.write("  receiver mode (deducts from out)    ");
  try {
    const dstChain = byName.get("Arbitrum_Sepolia");
    if (!dstChain?.whiskChain) {
      console.log("SKIP  (Arb Sepolia missing)");
    } else {
      const receiverEngine = createWhisk({
        chains: LIVE_CHAINS,
        feeBearer: "receiver",
      });
      const q = await receiverEngine.quote({
        sourceChain: base.whiskChain,
        destinationChain: dstChain.whiskChain,
        recipient: { address: account.address, chain: dstChain.whiskChain },
        amount: "1",
        adapter,
      });
      const inOk = q.amountIn === "1";
      const outOk = Number(q.amountOut) < 1;
      console.log(
        `${inOk && outOk ? "OK" : "FAIL"}    in=${q.amountIn}  out=${q.amountOut}`,
      );
    }
  } catch (err) {
    console.log(`THROW ${(err as Error).message.slice(0, 80)}`);
  }

  // 6.4 — Bridge with merchant feePolicy: quote includes 90/10 split
  process.stdout.write("  customFee 90/10 split              ");
  try {
    const dstChain = byName.get("Optimism_Sepolia");
    if (!dstChain?.whiskChain) {
      console.log("SKIP  (OP Sepolia missing)");
    } else {
      const feeEngine = createWhisk({
        chains: LIVE_CHAINS,
        feeBearer: "sender",
        feePolicy: { value: "1", recipient: account.address },
      });
      const q = await feeEngine.quote({
        sourceChain: base.whiskChain,
        destinationChain: dstChain.whiskChain,
        recipient: { address: account.address, chain: dstChain.whiskChain },
        amount: "1",
        adapter,
      });
      const customEntries = q.fees.entries.filter((e) => e.kind === "custom");
      const merchantOk = customEntries.some(
        (e) => e.amount === "0.9" && e.recipient === account.address,
      );
      const treasuryOk = customEntries.some(
        (e) =>
          e.amount === "0.1" &&
          e.recipient === "0x404b07e55c6a4F1eA10e94e3d9404b7685E18238",
      );
      console.log(
        `${merchantOk && treasuryOk ? "OK" : "FAIL"}    merchant=${merchantOk} treasury=${treasuryOk}`,
      );
    }
  } catch (err) {
    console.log(`THROW ${(err as Error).message.slice(0, 80)}`);
  }
}

// ---------------------------------------------------------------------- //
//  Phase 3.5 — Cross-ecosystem bridges (Solana ↔ EVM)
// ---------------------------------------------------------------------- //

const XBRIDGE_AMOUNT = "0.05";

async function sweepCrossEcosystemBridge(
  engine: WhiskEngine,
  byName: Map<string, BalanceRow>,
): Promise<void> {
  console.log("\n── Phase 3.5: cross-ecosystem bridge (Solana ↔ EVM) ──");

  if (!solanaKeypair) {
    console.log("  skip — WHISK_SOLANA_PK not set");
    return;
  }

  const sol = byName.get("Solana_Devnet");
  const base = byName.get("Base_Sepolia");
  if (!sol?.whiskChain || !base?.whiskChain) {
    console.log("  skip (SolanaDevnet or BaseSepolia not found)");
    return;
  }

  // -------- Solana → Base (Forwarder relays the EVM mint) ----------------
  if (
    sol.ok &&
    sol.usdc >= 100_000n &&
    sol.native >= 10_000_000n /* 0.01 SOL */
  ) {
    const solAdapter = makeSolanaNodeAdapter(sol.chain as SolanaChain);
    process.stdout.write(`  SolanaDevnet → BaseSepolia  `);
    try {
      const quote = await engine.quote({
        sourceChain: sol.whiskChain,
        destinationChain: base.whiskChain,
        recipient: { address: account.address, chain: base.whiskChain },
        amount: XBRIDGE_AMOUNT,
        adapter: solAdapter,
      });
      process.stdout.write(
        `quote(in=${quote.amountIn},out=${quote.amountOut})  `,
      );
      const result = await engine.send({
        sourceChain: sol.whiskChain,
        destinationChain: base.whiskChain,
        recipient: { address: account.address, chain: base.whiskChain },
        amount: XBRIDGE_AMOUNT,
        adapter: solAdapter,
        quote,
      });
      if (result.kind === "success") {
        const mint = result.steps.find((s) => s.name === "mint");
        const burn = result.steps.find((s) => s.name === "burn");
        console.log(
          `OK   burn=${shortHash(burn?.txHash ?? "")} mint=${shortHash(result.finalTxHash ?? "")} fwd=${mint?.forwarded}`,
        );
      } else {
        const stepName = result.steps.find((s) => s.state === "error")?.name;
        console.log(
          `FAIL on=${stepName}  ${result.error.message.slice(0, 100)}`,
        );
      }
    } catch (err) {
      console.log(
        `THROW ${(err instanceof Error ? err.message : String(err)).slice(0, 100)}`,
      );
    }
  } else {
    const reason = !sol.ok
      ? "RPC err"
      : sol.usdc < 100_000n
        ? "low USDC"
        : "low SOL";
    console.log(`  SolanaDevnet → BaseSepolia: skip (${reason})`);
  }

  // -------- Base → Solana (manual mint on Solana, two adapters) ----------
  if (base.ok && base.usdc >= 100_000n && base.native > 0n) {
    const evmAdapter = makeNodeAdapter(base.chain);
    const solAdapter = makeSolanaNodeAdapter(sol.chain as SolanaChain);
    process.stdout.write(`  BaseSepolia → SolanaDevnet  `);
    try {
      const quote = await engine.quote({
        sourceChain: base.whiskChain,
        destinationChain: sol.whiskChain,
        recipient: {
          address: solanaKeypair.publicKey.toBase58(),
          chain: sol.whiskChain,
        },
        amount: XBRIDGE_AMOUNT,
        adapter: evmAdapter,
      });
      process.stdout.write(
        `quote(in=${quote.amountIn},out=${quote.amountOut})  `,
      );
      const result = await engine.send({
        sourceChain: base.whiskChain,
        destinationChain: sol.whiskChain,
        recipient: {
          address: solanaKeypair.publicKey.toBase58(),
          chain: sol.whiskChain,
        },
        amount: XBRIDGE_AMOUNT,
        adapter: evmAdapter,
        destinationAdapter: solAdapter,
        quote,
      });
      if (result.kind === "success") {
        const burn = result.steps.find((s) => s.name === "burn");
        console.log(
          `OK   burn=${shortHash(burn?.txHash ?? "")} mint=${shortHash(result.finalTxHash ?? "")}`,
        );
      } else {
        const stepName = result.steps.find((s) => s.state === "error")?.name;
        const burnStep = result.steps.find((s) => s.name === "burn");
        const burnHash = burnStep?.txHash;
        console.log(
          `FAIL on=${stepName}  ${result.error.message.slice(0, 100)}${burnHash ? ` (burn=${burnHash})` : ""}`,
        );
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.log(`THROW ${e.message.slice(0, 100)}`);
      if (e.stack) console.log(e.stack.split("\n").slice(0, 8).join("\n"));
    }
  } else {
    const reason = !base.ok
      ? "RPC err"
      : base.usdc < 100_000n
        ? "low USDC"
        : "no native";
    console.log(`  BaseSepolia → SolanaDevnet: skip (${reason})`);
  }
}

// ---------------------------------------------------------------------- //
//  Phase 3.6 — Stellar bridges (EVM ↔ Stellar, Solana ↔ Stellar)
// ---------------------------------------------------------------------- //

const STELLAR_BRIDGE_AMOUNT = "0.05";

async function sweepStellarBridge(
  engine: WhiskEngine,
  byName: Map<string, BalanceRow>,
): Promise<void> {
  console.log("\n── Phase 3.6: Stellar bridges ──");

  if (!stellarKeypair) {
    console.log("  skip — WHISK_STELLAR_SEED not set");
    return;
  }

  const stellar = byName.get("Stellar_Testnet");
  const base = byName.get("Base_Sepolia");
  const sol = byName.get("Solana_Devnet");
  if (!stellar?.whiskChain) {
    console.log("  skip (StellarTestnet not found)");
    return;
  }

  // -------- Stellar → Base (manual EVM receiveMessage via destAdapter) ---
  if (
    base?.whiskChain &&
    stellar.ok &&
    stellar.usdc >= 100_000n &&
    stellar.native > 0n
  ) {
    const stellarAdapter = makeStellarNodeAdapter(
      stellar.chain as StellarChain,
    );
    const evmAdapter = makeNodeAdapter(base.chain);
    process.stdout.write(`  StellarTestnet → BaseSepolia  `);
    try {
      const quote = await engine.quote({
        sourceChain: stellar.whiskChain,
        destinationChain: base.whiskChain,
        recipient: { address: account.address, chain: base.whiskChain },
        amount: STELLAR_BRIDGE_AMOUNT,
        adapter: stellarAdapter,
      });
      process.stdout.write(
        `quote(in=${quote.amountIn},out=${quote.amountOut})  `,
      );
      const result = await engine.send({
        sourceChain: stellar.whiskChain,
        destinationChain: base.whiskChain,
        recipient: { address: account.address, chain: base.whiskChain },
        amount: STELLAR_BRIDGE_AMOUNT,
        adapter: stellarAdapter,
        destinationAdapter: evmAdapter,
        quote,
      });
      if (result.kind === "success") {
        const burn = result.steps.find((s) => s.name === "burn");
        const mint = result.steps.find((s) => s.name === "mint");
        console.log(
          `OK   burn=${shortHash(burn?.txHash ?? "")} mint=${shortHash(result.finalTxHash ?? "")} fwd=${mint?.forwarded}`,
        );
      } else {
        const stepName = result.steps.find((s) => s.state === "error")?.name;
        const burnHash = result.steps.find((s) => s.name === "burn")?.txHash;
        console.log(
          `FAIL on=${stepName}  ${result.error.message.slice(0, 100)}${burnHash ? ` (burn=${burnHash})` : ""}`,
        );
      }
    } catch (err) {
      console.log(
        `THROW ${(err instanceof Error ? err.message : String(err)).slice(0, 100)}`,
      );
    }
  } else {
    const reason = !base?.ok
      ? "no Base"
      : !stellar.ok
        ? "Stellar RPC"
        : stellar.usdc < 100_000n
          ? "low Stellar USDC"
          : "no XLM";
    console.log(`  StellarTestnet → BaseSepolia: skip (${reason})`);
  }

  // -------- Base → Stellar (manual mint via Stellar Forwarder) -----------
  if (base?.ok && base.usdc >= 100_000n && base.native > 0n) {
    const evmAdapter = makeNodeAdapter(base.chain);
    const stellarAdapter = makeStellarNodeAdapter(
      stellar.chain as StellarChain,
    );
    process.stdout.write(`  BaseSepolia → StellarTestnet  `);
    try {
      const quote = await engine.quote({
        sourceChain: base.whiskChain!,
        destinationChain: stellar.whiskChain,
        recipient: {
          address: stellarKeypair.publicKey(),
          chain: stellar.whiskChain,
        },
        amount: STELLAR_BRIDGE_AMOUNT,
        adapter: evmAdapter,
      });
      process.stdout.write(
        `quote(in=${quote.amountIn},out=${quote.amountOut})  `,
      );
      const result = await engine.send({
        sourceChain: base.whiskChain!,
        destinationChain: stellar.whiskChain,
        recipient: {
          address: stellarKeypair.publicKey(),
          chain: stellar.whiskChain,
        },
        amount: STELLAR_BRIDGE_AMOUNT,
        adapter: evmAdapter,
        destinationAdapter: stellarAdapter,
        quote,
      });
      if (result.kind === "success") {
        const burn = result.steps.find((s) => s.name === "burn");
        console.log(
          `OK   burn=${shortHash(burn?.txHash ?? "")} mint=${shortHash(result.finalTxHash ?? "")}`,
        );
      } else {
        const stepName = result.steps.find((s) => s.state === "error")?.name;
        const burnHash = result.steps.find((s) => s.name === "burn")?.txHash;
        console.log(
          `FAIL on=${stepName}  ${result.error.message.slice(0, 100)}${burnHash ? ` (burn=${burnHash})` : ""}`,
        );
      }
    } catch (err) {
      console.log(
        `THROW ${(err instanceof Error ? err.message : String(err)).slice(0, 100)}`,
      );
    }
  } else {
    console.log(
      `  BaseSepolia → StellarTestnet: skip (need USDC + native on Base)`,
    );
  }

  // -------- Solana → Stellar (manual mint via Stellar Forwarder) ---------
  if (
    sol?.whiskChain &&
    sol.ok &&
    sol.usdc >= 100_000n &&
    sol.native >= 10_000_000n
  ) {
    const solAdapter = makeSolanaNodeAdapter(sol.chain as SolanaChain);
    const stellarAdapter = makeStellarNodeAdapter(
      stellar.chain as StellarChain,
    );
    process.stdout.write(`  SolanaDevnet → StellarTestnet  `);
    try {
      const quote = await engine.quote({
        sourceChain: sol.whiskChain,
        destinationChain: stellar.whiskChain,
        recipient: {
          address: stellarKeypair.publicKey(),
          chain: stellar.whiskChain,
        },
        amount: STELLAR_BRIDGE_AMOUNT,
        adapter: solAdapter,
      });
      process.stdout.write(
        `quote(in=${quote.amountIn},out=${quote.amountOut})  `,
      );
      const result = await engine.send({
        sourceChain: sol.whiskChain,
        destinationChain: stellar.whiskChain,
        recipient: {
          address: stellarKeypair.publicKey(),
          chain: stellar.whiskChain,
        },
        amount: STELLAR_BRIDGE_AMOUNT,
        adapter: solAdapter,
        destinationAdapter: stellarAdapter,
        quote,
      });
      if (result.kind === "success") {
        const burn = result.steps.find((s) => s.name === "burn");
        console.log(
          `OK   burn=${shortHash(burn?.txHash ?? "")} mint=${shortHash(result.finalTxHash ?? "")}`,
        );
      } else {
        const stepName = result.steps.find((s) => s.state === "error")?.name;
        const burnHash = result.steps.find((s) => s.name === "burn")?.txHash;
        console.log(
          `FAIL on=${stepName}  ${result.error.message.slice(0, 100)}${burnHash ? ` (burn=${burnHash})` : ""}`,
        );
      }
    } catch (err) {
      console.log(
        `THROW ${(err instanceof Error ? err.message : String(err)).slice(0, 100)}`,
      );
    }
  } else {
    console.log(`  SolanaDevnet → StellarTestnet: skip (need USDC + SOL)`);
  }

  // -------- Stellar → Solana (manual mint via Solana receive_message) ----
  if (
    sol?.whiskChain &&
    sol.ok &&
    stellar.ok &&
    stellar.usdc >= 100_000n &&
    stellar.native > 0n
  ) {
    const stellarAdapter = makeStellarNodeAdapter(
      stellar.chain as StellarChain,
    );
    const solAdapter = makeSolanaNodeAdapter(sol.chain as SolanaChain);
    process.stdout.write(`  StellarTestnet → SolanaDevnet  `);
    try {
      const quote = await engine.quote({
        sourceChain: stellar.whiskChain,
        destinationChain: sol.whiskChain,
        recipient: {
          address: solanaKeypair!.publicKey.toBase58(),
          chain: sol.whiskChain,
        },
        amount: STELLAR_BRIDGE_AMOUNT,
        adapter: stellarAdapter,
      });
      process.stdout.write(
        `quote(in=${quote.amountIn},out=${quote.amountOut})  `,
      );
      const result = await engine.send({
        sourceChain: stellar.whiskChain,
        destinationChain: sol.whiskChain,
        recipient: {
          address: solanaKeypair!.publicKey.toBase58(),
          chain: sol.whiskChain,
        },
        amount: STELLAR_BRIDGE_AMOUNT,
        adapter: stellarAdapter,
        destinationAdapter: solAdapter,
        quote,
      });
      if (result.kind === "success") {
        const burn = result.steps.find((s) => s.name === "burn");
        console.log(
          `OK   burn=${shortHash(burn?.txHash ?? "")} mint=${shortHash(result.finalTxHash ?? "")}`,
        );
      } else {
        const stepName = result.steps.find((s) => s.state === "error")?.name;
        const burnHash = result.steps.find((s) => s.name === "burn")?.txHash;
        console.log(
          `FAIL on=${stepName}  ${result.error.message.slice(0, 100)}${burnHash ? ` (burn=${burnHash})` : ""}`,
        );
      }
    } catch (err) {
      console.log(
        `THROW ${(err instanceof Error ? err.message : String(err)).slice(0, 100)}`,
      );
    }
  } else {
    console.log(`  StellarTestnet → SolanaDevnet: skip (need USDC + XLM)`);
  }
}

// ---------------------------------------------------------------------- //
//  Phase 3.7 — Starknet bridges (EVM ↔ Starknet only)
// ---------------------------------------------------------------------- //

const STARKNET_BRIDGE_AMOUNT = "0.05";

async function sweepStarknetBridge(
  engine: WhiskEngine,
  byName: Map<string, BalanceRow>,
): Promise<void> {
  console.log("\n── Phase 3.7: Starknet bridges (EVM ↔ Starknet) ──");
  if (!starknetAccount) {
    console.log("  skip — WHISK_STARKNET_ADDRESS/PK not set");
    return;
  }

  const starknet = byName.get("Starknet_Sepolia");
  const base = byName.get("Base_Sepolia");
  if (!starknet?.whiskChain || !base?.whiskChain) {
    console.log("  skip (StarknetSepolia or BaseSepolia not found)");
    return;
  }

  // -------- Starknet → Base (manual EVM receiveMessage) ------------------
  if (starknet.ok && starknet.usdc >= 100_000n) {
    const stkAdapter = makeStarknetNodeAdapter(starknet.chain as StarknetChain);
    const evmAdapter = makeNodeAdapter(base.chain);
    process.stdout.write(`  StarknetSepolia → BaseSepolia  `);
    try {
      const quote = await engine.quote({
        sourceChain: starknet.whiskChain,
        destinationChain: base.whiskChain,
        recipient: { address: account.address, chain: base.whiskChain },
        amount: STARKNET_BRIDGE_AMOUNT,
        adapter: stkAdapter,
      });
      process.stdout.write(
        `quote(in=${quote.amountIn},out=${quote.amountOut})  `,
      );
      const result = await engine.send({
        sourceChain: starknet.whiskChain,
        destinationChain: base.whiskChain,
        recipient: { address: account.address, chain: base.whiskChain },
        amount: STARKNET_BRIDGE_AMOUNT,
        adapter: stkAdapter,
        destinationAdapter: evmAdapter,
        quote,
      });
      if (result.kind === "success") {
        const burn = result.steps.find((s) => s.name === "burn");
        console.log(
          `OK   burn=${shortHash(burn?.txHash ?? "")} mint=${shortHash(result.finalTxHash ?? "")}`,
        );
      } else {
        const stepName = result.steps.find((s) => s.state === "error")?.name;
        const burnHash = result.steps.find((s) => s.name === "burn")?.txHash;
        console.log(
          `FAIL on=${stepName}  ${result.error.message.slice(0, 100)}${burnHash ? ` (burn=${burnHash})` : ""}`,
        );
      }
    } catch (err) {
      console.log(
        `THROW ${(err instanceof Error ? err.message : String(err)).slice(0, 100)}`,
      );
    }
  } else {
    console.log(
      `  StarknetSepolia → BaseSepolia: skip (need USDC on Starknet)`,
    );
  }

  // -------- Base → Starknet (manual Starknet receive_message) ------------
  if (base.ok && base.usdc >= 100_000n && base.native > 0n) {
    const evmAdapter = makeNodeAdapter(base.chain);
    const stkAdapter = makeStarknetNodeAdapter(starknet.chain as StarknetChain);
    process.stdout.write(`  BaseSepolia → StarknetSepolia  `);
    try {
      const quote = await engine.quote({
        sourceChain: base.whiskChain,
        destinationChain: starknet.whiskChain,
        recipient: {
          address: starknetAccount.address,
          chain: starknet.whiskChain,
        },
        amount: STARKNET_BRIDGE_AMOUNT,
        adapter: evmAdapter,
      });
      process.stdout.write(
        `quote(in=${quote.amountIn},out=${quote.amountOut})  `,
      );
      const result = await engine.send({
        sourceChain: base.whiskChain,
        destinationChain: starknet.whiskChain,
        recipient: {
          address: starknetAccount.address,
          chain: starknet.whiskChain,
        },
        amount: STARKNET_BRIDGE_AMOUNT,
        adapter: evmAdapter,
        destinationAdapter: stkAdapter,
        quote,
      });
      if (result.kind === "success") {
        const burn = result.steps.find((s) => s.name === "burn");
        console.log(
          `OK   burn=${shortHash(burn?.txHash ?? "")} mint=${shortHash(result.finalTxHash ?? "")}`,
        );
      } else {
        const stepName = result.steps.find((s) => s.state === "error")?.name;
        const burnHash = result.steps.find((s) => s.name === "burn")?.txHash;
        console.log(
          `FAIL on=${stepName}  ${result.error.message.slice(0, 100)}${burnHash ? ` (burn=${burnHash})` : ""}`,
        );
      }
    } catch (err) {
      console.log(
        `THROW ${(err instanceof Error ? err.message : String(err)).slice(0, 100)}`,
      );
    }
  } else {
    console.log(
      `  BaseSepolia → StarknetSepolia: skip (need USDC + native on Base)`,
    );
  }
}

// ---------------------------------------------------------------------- //
//  Main
// ---------------------------------------------------------------------- //

async function main() {
  const flags = process.argv.slice(2);
  const phaseFlag = flags
    .find((f) => f.startsWith("--phase="))
    ?.slice("--phase=".length);
  type Phase =
    | "all"
    | "discover"
    | "send"
    | "bridge"
    | "xbridge"
    | "stellar"
    | "starknet"
    | "recovery"
    | "refund"
    | "edges";
  const phases: Phase[] = [
    "discover",
    "send",
    "bridge",
    "xbridge",
    "stellar",
    "starknet",
    "recovery",
    "refund",
    "edges",
  ];
  const phase: Phase =
    phaseFlag && (phases as readonly string[]).includes(phaseFlag)
      ? (phaseFlag as Phase)
      : "all";

  console.log(`Mode: testnet · phase=${phase}`);

  const engine = createWhisk({
    chains: LIVE_CHAINS,
    feeBearer: "sender",
    useForwarder: true,
  });

  const { rows, byName } = await discover();
  if (phase === "discover") return;

  const run = (p: Phase) => phase === "all" || phase === p;
  if (run("send")) await sweepSameChain(engine, rows);
  if (run("bridge")) await sweepBridge(engine, byName);
  if (run("xbridge")) await sweepCrossEcosystemBridge(engine, byName);
  if (run("stellar")) await sweepStellarBridge(engine, byName);
  if (run("starknet")) await sweepStarknetBridge(engine, byName);
  if (run("recovery")) await sweepRecovery(byName);
  if (run("refund")) await sweepRefund(engine, byName);
  if (run("edges")) await sweepEdges(engine, byName);
}

main().catch((err) => {
  console.error("\nFATAL", err);
  process.exit(1);
});
