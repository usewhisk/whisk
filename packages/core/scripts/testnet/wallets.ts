import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import bs58 from "bs58";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  BASE_FEE,
  Keypair as StellarKeypair,
  TransactionBuilder as StellarTxBuilder,
  rpc as sorobanRpc,
} from "@stellar/stellar-sdk";
import {
  Account as StarknetAccount,
  RpcProvider as StarknetRpcProvider,
} from "starknet";
import {
  getChain,
  usdcAbi,
  type CctpChain,
  type EvmChain,
  type SolanaChain,
  type StarknetChain,
  type StellarChain,
} from "@usewhisk/cctp";
import type {
  Chain,
  EvmAdapter,
  SolanaAdapter,
  StarknetAdapter,
  StellarAdapter,
  WhiskAdapter,
} from "../../src/index.js";

const STELLAR_HORIZON_TESTNET = "https://horizon-testnet.stellar.org";

export class MissingKeyError extends Error {}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function required(name: string, purpose: string): string {
  const value = env(name);
  if (!value) throw new MissingKeyError(`Set ${name} to ${purpose}.`);
  return value;
}

/** `WHISK_RPC_Base_Sepolia=https://...` overrides that chain's public RPC. */
export function rpcUrl(chain: CctpChain): string {
  const url = env(`WHISK_RPC_${chain.id}`) ?? chain.defaultRpcUrls[0];
  if (!url) throw new Error(`No RPC URL for ${chain.id}.`);
  return url;
}

export function rpcOverrides(
  chains: readonly Chain[],
): Partial<Record<Chain, string>> {
  const overrides: Partial<Record<Chain, string>> = {};
  for (const id of chains) {
    const url = env(`WHISK_RPC_${id}`);
    if (url) overrides[id] = url;
  }
  return overrides;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function evmAccount() {
  const raw = required(
    "WHISK_LIVE_PK",
    "a funded EVM testnet key (64 hex characters, 0x optional)",
  );
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new MissingKeyError(
      "WHISK_LIVE_PK must be 64 hex characters, with or without 0x.",
    );
  }
  return privateKeyToAccount(key as Hex);
}

function evmClients(chain: EvmChain) {
  const viemChain = defineChain({
    id: chain.evmChainId,
    name: chain.label,
    nativeCurrency: {
      name: chain.nativeCurrency.symbol,
      ...chain.nativeCurrency,
    },
    rpcUrls: { default: { http: [rpcUrl(chain)] } },
  });
  const transport = http(rpcUrl(chain));
  return {
    publicClient: createPublicClient({ chain: viemChain, transport }),
    walletClient: createWalletClient({
      account: evmAccount(),
      chain: viemChain,
      transport,
    }),
  };
}

function evmWallet(chain: EvmChain): EvmAdapter {
  const { publicClient, walletClient } = evmClients(chain);
  return {
    kind: "evm",
    address: walletClient.account.address,
    async getChainId() {
      return chain.evmChainId;
    },
    async switchChain(id) {
      if (id !== chain.evmChainId) {
        throw new Error(`This wallet only signs on ${chain.id}.`);
      }
    },
    async sendCalls(calls, options) {
      const hashes: Hex[] = [];
      for (const call of calls) {
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
        });
        hashes.push(hash);
        options?.onSubmitted?.(hash, hashes.length - 1);
        // Public testnet RPCs are load-balanced. A node a block behind
        // estimates the burn against the old allowance, so wait for two.
        await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 2,
        });
      }
      return { hashes };
    },
    async waitForReceipt(hash) {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return {
        status: receipt.status === "success" ? "success" : "reverted",
        blockNumber: receipt.blockNumber,
      };
    },
  };
}

function solanaKeypair(): Keypair {
  const raw = required(
    "WHISK_SOLANA_PK",
    "a funded Solana Devnet secret key in base58",
  );
  return Keypair.fromSecretKey(bs58.decode(raw));
}

function solanaWallet(chain: SolanaChain): SolanaAdapter {
  const keypair = solanaKeypair();
  const connection = new Connection(rpcUrl(chain), "confirmed");
  return {
    kind: "solana",
    address: keypair.publicKey.toBase58(),
    async getCluster() {
      return chain.cluster;
    },
    async sendTransaction(instructions, options) {
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
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      tx.feePayer = keypair.publicKey;
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      const extra = (options?.extraSigners ?? []).map((s) =>
        Keypair.fromSecretKey(s.secretKey),
      );
      tx.sign(keypair, ...extra);
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        preflightCommitment: "confirmed",
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
        slot: BigInt(result.context.slot),
      };
    },
    async getAccountInfo(pubkey) {
      const info = await connection.getAccountInfo(
        new PublicKey(pubkey),
        "confirmed",
      );
      return info ? { data: new Uint8Array(info.data) } : null;
    },
  };
}

function stellarKeypair(): StellarKeypair {
  return StellarKeypair.fromSecret(
    required(
      "WHISK_STELLAR_SEED",
      "a funded Stellar Testnet secret seed with a USDC trustline",
    ),
  );
}

async function waitForStellarTx(
  server: sorobanRpc.Server,
  hash: string,
): Promise<{ status: "success" | "reverted"; ledger: number }> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const tx = await server.getTransaction(hash);
    if (tx.status === sorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      return { status: "success", ledger: tx.ledger };
    }
    if (tx.status === sorobanRpc.Api.GetTransactionStatus.FAILED) {
      return { status: "reverted", ledger: tx.ledger };
    }
    await sleep(2_000);
  }
  throw new Error(`Stellar transaction ${hash} did not land in 90s.`);
}

function stellarWallet(chain: StellarChain): StellarAdapter {
  const keypair = stellarKeypair();
  const server = new sorobanRpc.Server(rpcUrl(chain));
  return {
    kind: "stellar",
    address: keypair.publicKey(),
    async getNetwork() {
      return chain.stellarNetwork;
    },
    async submitInvocation(invocations) {
      const hashes: string[] = [];
      for (const inv of invocations) {
        const source = await server.getAccount(keypair.publicKey());
        const draft = new StellarTxBuilder(source, {
          fee: BASE_FEE,
          networkPassphrase: chain.networkPassphrase,
        })
          .addOperation(inv.operation)
          .setTimeout(180)
          .build();
        const sim = await server.simulateTransaction(draft);
        if (sorobanRpc.Api.isSimulationError(sim)) {
          throw new Error(
            `${inv.functionName} simulation failed: ${sim.error}`,
          );
        }
        const tx = sorobanRpc.assembleTransaction(draft, sim).build();
        tx.sign(keypair);
        const sent = await server.sendTransaction(tx);
        if (sent.status !== "PENDING") {
          throw new Error(
            `${inv.functionName} was not accepted: ${sent.status}`,
          );
        }
        hashes.push(sent.hash);
        // The next invocation reuses the account sequence and may depend on
        // this one, as the burn does on the approve.
        const landed = await waitForStellarTx(server, sent.hash);
        if (landed.status !== "success") {
          throw new Error(`${inv.functionName} reverted: ${sent.hash}`);
        }
      }
      return { hashes };
    },
    async confirmTransaction(hash) {
      return waitForStellarTx(server, hash);
    },
    async getLatestLedger() {
      return (await server.getLatestLedger()).sequence;
    },
  };
}

function starknetAccount(chain: StarknetChain) {
  const address = required(
    "WHISK_STARKNET_ADDRESS",
    "a deployed Starknet Sepolia account address",
  );
  const key = required("WHISK_STARKNET_PK", "that account's private key");
  // starknet.js defaults to block `pending`, which public RPCs reject.
  const provider = new StarknetRpcProvider({
    nodeUrl: rpcUrl(chain),
    blockIdentifier: "latest",
  });
  return {
    provider,
    account: new StarknetAccount({ provider, address, signer: key }),
  };
}

function starknetWallet(chain: StarknetChain): StarknetAdapter {
  const { provider, account } = starknetAccount(chain);
  return {
    kind: "starknet",
    address: account.address,
    async getChainId() {
      return provider.getChainId();
    },
    async submitCalls(calls) {
      const result = await account.execute(
        calls.map((c) => ({
          contractAddress: c.contractAddress,
          entrypoint: c.entrypoint,
          calldata: c.calldata,
        })),
      );
      return { hashes: [result.transaction_hash] };
    },
    async confirmTransaction(hash) {
      const receipt = await provider.waitForTransaction(hash, {
        retryInterval: 3_000,
      });
      const blockNumber =
        "block_number" in receipt && typeof receipt.block_number === "number"
          ? receipt.block_number
          : 0;
      return {
        status: receipt.isSuccess() ? "success" : "reverted",
        blockNumber,
      };
    },
  };
}

/** Throws `MissingKeyError` when the chain's key is not set. */
export function walletFor(id: Chain): WhiskAdapter {
  const chain = getChain(id);
  switch (chain.ecosystem) {
    case "evm":
      return evmWallet(chain);
    case "solana":
      return solanaWallet(chain);
    case "stellar":
      return stellarWallet(chain);
    case "starknet":
      return starknetWallet(chain);
  }
}

/**
 * The USDC `address` holds on `id`, in 6-decimal subunits. Stellar's 7-decimal
 * balance is truncated to 6 so every chain compares against the quote.
 */
export async function usdcBalance(id: Chain, address: string): Promise<bigint> {
  const chain = getChain(id);
  switch (chain.ecosystem) {
    case "evm": {
      const { publicClient } = evmClients(chain);
      return publicClient.readContract({
        address: chain.usdc,
        abi: usdcAbi,
        functionName: "balanceOf",
        args: [address as Hex],
      });
    }
    case "solana": {
      const connection = new Connection(rpcUrl(chain), "confirmed");
      const ata = getAssociatedTokenAddressSync(
        new PublicKey(chain.usdc),
        new PublicKey(address),
      );
      const info = await connection.getAccountInfo(ata, "confirmed");
      if (!info) return 0n;
      const { value } = await connection.getTokenAccountBalance(
        ata,
        "confirmed",
      );
      return BigInt(value.amount);
    }
    case "stellar": {
      const res = await fetch(`${STELLAR_HORIZON_TESTNET}/accounts/${address}`);
      if (!res.ok) throw new Error(`Horizon answered ${res.status}.`);
      const body = (await res.json()) as {
        balances?: {
          asset_code?: string;
          asset_issuer?: string;
          balance: string;
        }[];
      };
      const line = body.balances?.find(
        (b) => b.asset_code === "USDC" && b.asset_issuer === chain.usdcIssuer,
      );
      if (!line) {
        throw new Error(`${address} has no USDC trustline on ${chain.id}.`);
      }
      const [whole = "0", fraction = ""] = line.balance.split(".");
      return (
        BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(7, "0").slice(0, 6))
      );
    }
    case "starknet": {
      const { provider } = starknetAccount(chain);
      const [low = "0", high = "0"] = await provider.callContract({
        contractAddress: chain.usdc,
        entrypoint: "balance_of",
        calldata: [address],
      });
      return (BigInt(high) << 128n) + BigInt(low);
    }
  }
}
