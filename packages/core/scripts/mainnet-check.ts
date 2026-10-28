/**
 * The two mainnet transfers that gate a release: Base to Arc, then Arc to
 * Base, each to the signer's own address. Every burn waits for you to type
 * "send" after the quote is shown.
 *
 *   pnpm --filter @usewhisk/core exec tsx scripts/mainnet-check.ts
 *   ... --leg=base-arc | --leg=arc-base     run one leg
 *   ... --amount=1                          USDC per leg, default 1
 *   ... --resume                            finish a burn that never minted
 *
 * Key: WHISK_LIVE_PK. WHISK_RPC_Base and WHISK_RPC_Arc override the public
 * RPCs. In-flight transfers are kept in .mainnet-inflight.json until they mint.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { createPublicClient, formatUnits, http } from "viem";
import { getChain } from "@usewhisk/cctp";
import {
  createStorageInflightStore,
  createWhisk,
  type Chain,
  type InflightStorage,
  type SendListeners,
  type SendResult,
} from "../src/index.js";
import {
  rpcOverrides,
  rpcUrl,
  usdcBalance,
  walletFor,
} from "./testnet/wallets.js";

const LEGS = {
  "base-arc": ["Base", "Arc"],
  "arc-base": ["Arc", "Base"],
} as const satisfies Record<string, readonly [Chain, Chain]>;
type Leg = keyof typeof LEGS;

const BALANCE_WAIT_MS = 5 * 60_000;
const INFLIGHT_FILE = resolve(".mainnet-inflight.json");

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key = "", value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value] as const;
  }),
);
const AMOUNT = args.get("amount") ?? "1";

const started = Date.now();
const log = (label: string, line: string) =>
  console.log(
    `[${((Date.now() - started) / 1000).toFixed(0)}s] ${label}: ${line}`,
  );
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const usdc = (subunits: bigint) => formatUnits(subunits, 6);

function txUrl(chain: Chain, hash: string): string {
  return `${getChain(chain).explorerUrl}/tx/${hash}`;
}

/** A synchronous JSON file, so a record is on disk before the process exits. */
function fileStorage(path: string): InflightStorage {
  const read = (): Record<string, string> =>
    existsSync(path)
      ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, string>)
      : {};
  const write = (data: Record<string, string>) =>
    writeFileSync(path, JSON.stringify(data, null, 2));
  return {
    get length() {
      return Object.keys(read()).length;
    },
    key: (i) => Object.keys(read())[i] ?? null,
    getItem: (key) => read()[key] ?? null,
    setItem: (key, value) => write({ ...read(), [key]: String(value) }),
    removeItem: (key) => {
      const data = read();
      delete data[key];
      write(data);
    },
  };
}

function engine() {
  const chains: Chain[] = ["Base", "Arc"];
  return createWhisk({
    chains,
    rpcUrls: rpcOverrides(chains),
    inflightStore: createStorageInflightStore(fileStorage(INFLIGHT_FILE)),
  });
}

function stepLogger(
  label: string,
  source: Chain,
  destination: Chain,
): SendListeners {
  return {
    onStep: (step) => {
      const chain = step.name === "mint" ? destination : source;
      const tx = step.txHash ? ` ${txUrl(chain, step.txHash)}` : "";
      log(label, `${step.name} ${step.state}${tx}`);
    },
  };
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim().toLowerCase() === "send";
}

async function waitForCredit(
  chain: Chain,
  address: string,
  before: bigint,
): Promise<bigint> {
  const deadline = Date.now() + BALANCE_WAIT_MS;
  let received = 0n;
  while (Date.now() < deadline) {
    received = (await usdcBalance(chain, address)) - before;
    if (received > 0n) return received;
    await sleep(5_000);
  }
  return received;
}

function describeFailure(result: SendResult): string {
  if (result.kind === "success") return "";
  const burn = result.steps.find((s) => s.name === "burn")?.txHash;
  const lines = [`${result.error.code}: ${result.error.message}`];
  if (burn) {
    lines.push(
      `The burn landed (${burn}). Run again with --resume to finish the mint.`,
    );
  }
  return lines.join("\n");
}

async function runLeg(leg: Leg): Promise<boolean> {
  const [source, destination] = LEGS[leg];
  const label = `${source} -> ${destination}`;
  const wallet = walletFor(source);
  const receiver = walletFor(destination);
  const whisk = engine();

  await dismissMinted(whisk);
  const pending = await whisk.inflight();
  if (pending.length > 0) {
    log(
      label,
      `${INFLIGHT_FILE} holds an unfinished transfer. Run --resume first.`,
    );
    return false;
  }

  const sourceChain = getChain(source);
  if (sourceChain.ecosystem !== "evm") throw new Error(`${source} is not EVM`);
  const client = createPublicClient({ transport: http(rpcUrl(sourceChain)) });
  const native = await client.getBalance({
    address: wallet.address as `0x${string}`,
  });
  const balance = await usdcBalance(source, wallet.address);
  const gas = sourceChain.nativeCurrency;
  // Arc pays gas in USDC, so its native balance is the same money again.
  const gasLine =
    gas.symbol === "USDC"
      ? "gas is paid from that USDC"
      : `gas balance ${formatUnits(native, gas.decimals)} ${gas.symbol}`;
  log(
    label,
    `wallet ${wallet.address} holds ${usdc(balance)} USDC on ${source}, ${gasLine}`,
  );
  if (native === 0n) {
    log(
      label,
      `no ${sourceChain.nativeCurrency.symbol} on ${source} to pay gas`,
    );
    return false;
  }

  const quote = await whisk.quote({
    sourceChain: source,
    destinationChain: destination,
    recipient: { address: receiver.address, chain: destination },
    amount: AMOUNT,
    adapter: wallet,
    destinationAdapter: receiver,
  });
  console.log("");
  console.log(
    `  ${label}, ${quote.plan?.speed ?? "?"} transfer, ${quote.feeMode} fees`,
  );
  console.log(`  you pay      ${quote.amountIn} USDC on ${source}`);
  console.log(
    `  you receive  at least ${quote.amountOut} USDC on ${destination}`,
  );
  for (const fee of quote.fees.entries) {
    const unit =
      fee.token === "NATIVE" ? sourceChain.nativeCurrency.symbol : "USDC";
    console.log(
      `    ${fee.kind.padEnd(10)} ${fee.amount} ${unit}${fee.description ? `  (${fee.description})` : ""}`,
    );
  }
  console.log(`  recipient    ${receiver.address}`);
  console.log(`  mint         ${quote.plan?.mint.kind ?? "?"}`);
  console.log("");

  const max = await whisk.maxSendable({
    sourceChain: source,
    destinationChain: destination,
    recipient: { address: receiver.address, chain: destination },
    adapter: wallet,
    destinationAdapter: receiver,
  });
  const spendable = max ? max.balance - max.gasReserve : balance;
  if (quote.subunits.amountIn > spendable) {
    log(
      label,
      `the transfer needs ${quote.amountIn} USDC but only ${usdc(spendable)} can be spent after gas. Try --amount=${max?.amount ?? "less"}.`,
    );
    return false;
  }

  if (
    !(await confirm(
      `Type "send" to burn ${quote.amountIn} USDC on ${source} mainnet: `,
    ))
  ) {
    log(label, "skipped");
    return false;
  }

  const before = await usdcBalance(destination, receiver.address);
  const result = await whisk.send(
    { quote, adapter: wallet, destinationAdapter: receiver },
    stepLogger(label, source, destination),
  );
  if (result.kind !== "success") {
    log(label, `FAILED\n${describeFailure(result)}`);
    return false;
  }

  const received = await waitForCredit(destination, receiver.address, before);
  const ok = received >= quote.subunits.amountOut;
  log(
    label,
    `${ok ? "PASS" : "FAIL"}: received ${usdc(received)} USDC, expected at least ${quote.amountOut}`,
  );
  if (result.finalTxHash)
    log(label, `mint ${txUrl(destination, result.finalTxHash)}`);
  if (ok) await dismissMinted(whisk);
  return ok;
}

/** The engine keeps a minted record as a receipt until it is dismissed. */
async function dismissMinted(whisk: ReturnType<typeof engine>): Promise<void> {
  for (const record of await whisk.inflight()) {
    if (record.step !== "minted") continue;
    log(
      "inflight",
      `dismissing the finished ${record.sourceChain} -> ${record.destinationChain} record`,
    );
    await whisk.dismiss(record.id);
  }
}

async function resumeAll(): Promise<boolean> {
  const whisk = engine();
  await dismissMinted(whisk);
  const records = await whisk.inflight();
  if (records.length === 0) {
    log("resume", `nothing to resume in ${INFLIGHT_FILE}`);
    return true;
  }
  let allOk = true;
  for (const record of records) {
    const label = `resume ${record.sourceChain} -> ${record.destinationChain}`;
    const receiver = walletFor(record.destinationChain);
    const before = await usdcBalance(record.destinationChain, receiver.address);
    const result = await whisk.resume(
      record,
      { destinationAdapter: receiver },
      stepLogger(label, record.sourceChain, record.destinationChain),
    );
    if (result.kind !== "success") {
      log(label, `FAILED\n${describeFailure(result)}`);
      allOk = false;
      continue;
    }
    const received = await waitForCredit(
      record.destinationChain,
      receiver.address,
      before,
    );
    log(label, `received ${usdc(received)} USDC`);
    if (received > 0n) await whisk.dismiss(record.id);
    else allOk = false;
  }
  return allOk;
}

async function main(): Promise<boolean> {
  if (args.has("resume")) return resumeAll();
  const only = args.get("leg");
  if (only && !(only in LEGS)) {
    throw new Error(`--leg must be one of ${Object.keys(LEGS).join(", ")}`);
  }
  const legs: Leg[] = only ? [only as Leg] : ["base-arc", "arc-base"];
  for (const leg of legs) {
    if (!(await runLeg(leg))) return false;
  }
  return true;
}

main().then(
  (ok) => process.exit(ok ? 0 : 1),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
