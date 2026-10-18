/**
 * Reads every EVM registry entry back from the chain over its public RPCs and
 * fails on any disagreement. Needs the network, so it runs nightly, not in CI.
 *
 *   pnpm --filter @usewhisk/cctp check:registry
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  ExecutionRevertedError,
  createPublicClient,
  fallback,
  getAddress,
  http,
  parseAbi,
  type PublicClient,
} from "viem";
import { CHAINS, isEvmChain, type EvmChain } from "../src/index.js";

const abi = parseAbi([
  "function localDomain() view returns (uint32)",
  "function localMessageTransmitter() view returns (address)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function getMinFeeAmount(uint256) view returns (uint256)",
]);

// Only a TokenMessengerV2 with Circle's Standard fee switch has
// getMinFeeAmount. On the others the call reverts.
async function hasFeeSwitch(
  client: PublicClient,
  chain: EvmChain,
): Promise<boolean> {
  try {
    await client.readContract({
      address: chain.tokenMessenger,
      abi,
      functionName: "getMinFeeAmount",
      args: [1_000_000n],
    });
    return true;
  } catch (err) {
    const reverted =
      err instanceof BaseError &&
      err.walk(
        (e) =>
          e instanceof ContractFunctionRevertedError ||
          e instanceof ExecutionRevertedError,
      ) !== null;
    if (reverted) return false;
    throw err;
  }
}

type Result = { chain: EvmChain; problems: string[] };

async function check(chain: EvmChain): Promise<Result> {
  const client: PublicClient = createPublicClient({
    transport: fallback(
      chain.defaultRpcUrls.map((url) =>
        // XDC's Cloudflare front rejects Node's default user agent.
        http(url, {
          timeout: 15_000,
          retryCount: 1,
          fetchOptions: { headers: { "user-agent": "whisk-registry-check" } },
        }),
      ),
    ),
  });
  const problems: string[] = [];
  const expect = (what: string, actual: unknown, wanted: unknown) => {
    if (actual !== wanted) {
      problems.push(
        `${what} is ${String(actual)}, registry says ${String(wanted)}`,
      );
    }
  };

  try {
    // Sei's public RPC answers with "invalid params" when this call shares a
    // burst with the reads below, so it goes first on its own.
    const feeSwitch = await hasFeeSwitch(client, chain);
    const [chainId, domain, transmitter, decimals, symbol] = await Promise.all([
      client.getChainId(),
      client.readContract({
        address: chain.messageTransmitter,
        abi,
        functionName: "localDomain",
      }),
      client.readContract({
        address: chain.tokenMessenger,
        abi,
        functionName: "localMessageTransmitter",
      }),
      client.readContract({
        address: chain.usdc,
        abi,
        functionName: "decimals",
      }),
      client.readContract({
        address: chain.usdc,
        abi,
        functionName: "symbol",
      }),
    ]);
    expect("eth_chainId", chainId, chain.evmChainId);
    expect("MessageTransmitterV2.localDomain()", domain, chain.cctpDomain);
    expect(
      "TokenMessengerV2.localMessageTransmitter()",
      getAddress(transmitter),
      getAddress(chain.messageTransmitter),
    );
    expect("USDC.decimals()", decimals, chain.usdcDecimals);
    // Bridged tokens such as Stargate's USDC.e also have 6 decimals.
    expect("USDC.symbol()", symbol, "USDC");
    expect(
      "TokenMessengerV2.getMinFeeAmount() answers",
      feeSwitch,
      chain.capabilities.standardFeeSwitch,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message.split("\n")[0] : err;
    problems.push(`unreachable or reverted: ${String(message)}`);
  }
  return { chain, problems };
}

// Public RPCs drop requests now and then, so a chain fails only if three
// attempts in a row disagree or go unanswered.
async function checkWithRetry(chain: EvmChain): Promise<Result> {
  let result = await check(chain);
  for (let attempt = 1; attempt < 3 && result.problems.length > 0; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5_000 * attempt));
    result = await check(chain);
  }
  return result;
}

const evm = CHAINS.filter(isEvmChain);
const results = await Promise.all(evm.map(checkWithRetry));

let failed = 0;
for (const { chain, problems } of results) {
  const tag = `${chain.id} (${chain.evmChainId}, domain ${chain.cctpDomain})`;
  if (problems.length === 0) {
    console.log(`ok    ${tag}`);
    continue;
  }
  failed += 1;
  console.log(`FAIL  ${tag}`);
  for (const p of problems) console.log(`        ${p}`);
}

console.log(`\n${evm.length - failed} of ${evm.length} EVM chains match.`);
if (failed > 0) process.exit(1);
