/**
 * Sends 1 USDC each way between Base Sepolia and Arc Testnet with Circle's
 * upfront fees, and checks the recipient's balance rises by exactly 1 USDC.
 * The signer pays itself, so only the fees and gas leave the wallet.
 *
 *   WHISK_LIVE_PK=0x... pnpm --filter @usewhisk/core test:upfront
 */
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChain, isEvmChain, usdcAbi, type EvmChain } from "@usewhisk/cctp";
import { createWhisk, type Chain, type EvmAdapter } from "../src/index.js";

const AMOUNT = "1";
const AMOUNT_SUBUNITS = 1_000_000n;
const MINT_TIMEOUT_MS = 5 * 60_000;

const raw = process.env.WHISK_LIVE_PK ?? "";
const key = raw.startsWith("0x") ? raw : `0x${raw}`;
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error(
    "Set WHISK_LIVE_PK to a funded testnet private key: 64 hex characters, with or without 0x.",
  );
  process.exit(1);
}
const account = privateKeyToAccount(key as Hex);

function evm(id: Chain): EvmChain {
  const chain = getChain(id);
  if (!isEvmChain(chain)) throw new Error(`${id} is not EVM`);
  return chain;
}

function clients(chain: EvmChain) {
  const viemChain = defineChain({
    id: chain.evmChainId,
    name: chain.label,
    nativeCurrency: {
      name: chain.nativeCurrency.symbol,
      ...chain.nativeCurrency,
    },
    rpcUrls: { default: { http: [...chain.defaultRpcUrls] } },
  });
  const transport = http(chain.defaultRpcUrls[0]);
  return {
    publicClient: createPublicClient({ chain: viemChain, transport }),
    walletClient: createWalletClient({ account, chain: viemChain, transport }),
  };
}

function adapter(chain: EvmChain): EvmAdapter {
  const { publicClient, walletClient } = clients(chain);
  return {
    kind: "evm",
    address: account.address,
    async getChainId() {
      return chain.evmChainId;
    },
    async switchChain(id) {
      if (id !== chain.evmChainId) {
        throw new Error(`This adapter only signs on ${chain.id}.`);
      }
    },
    async sendCalls(calls) {
      const hashes: Hex[] = [];
      // One at a time: the burn needs the approve mined first. Base Sepolia's
      // public RPC is load-balanced, and a node one block behind estimates
      // the burn against the old allowance, so wait for two confirmations.
      for (const call of calls) {
        const hash = await walletClient.sendTransaction({
          to: call.to,
          data: call.data,
          value: call.value,
        });
        await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 2,
        });
        hashes.push(hash);
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

async function usdcBalance(chain: EvmChain): Promise<bigint> {
  return clients(chain).publicClient.readContract({
    address: chain.usdc,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
}

async function run(sourceId: Chain, destinationId: Chain): Promise<boolean> {
  const source = evm(sourceId);
  const destination = evm(destinationId);
  const tag = `${sourceId} -> ${destinationId}`;
  const engine = createWhisk({ chains: [sourceId, destinationId] });
  const wallet = adapter(source);

  const quote = await engine.quote({
    sourceChain: sourceId,
    destinationChain: destinationId,
    recipient: { address: account.address, chain: destinationId },
    amount: AMOUNT,
    adapter: wallet,
  });
  console.log(
    `${tag}: ${quote.feeMode}, ${quote.plan?.speed}, pay ${quote.amountIn}, receive ${quote.amountOut}`,
  );
  if (quote.feeMode !== "upfront") {
    console.log(`FAIL ${tag}: expected an upfront quote`);
    return false;
  }

  const before = await usdcBalance(destination);
  const started = Date.now();
  const seconds = () => ((Date.now() - started) / 1000).toFixed(1);
  const result = await engine.send(
    { adapter: wallet, quote },
    {
      onStep: (step) =>
        console.log(`  ${seconds()}s ${step.name} ${step.state}`),
    },
  );
  if (result.kind !== "success") {
    console.log(`FAIL ${tag}: ${result.error.message}`);
    return false;
  }

  const deadline = Date.now() + MINT_TIMEOUT_MS;
  let received = 0n;
  while (Date.now() < deadline) {
    received = (await usdcBalance(destination)) - before;
    if (received > 0n) break;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  const ok = received === AMOUNT_SUBUNITS;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${tag}: received ${received} subunits after ${seconds()}s, mint ${result.finalTxHash ?? "?"}`,
  );
  return ok;
}

const results = [
  await run("Base_Sepolia", "Arc_Testnet"),
  await run("Arc_Testnet", "Base_Sepolia"),
];
process.exit(results.every(Boolean) ? 0 : 1);
