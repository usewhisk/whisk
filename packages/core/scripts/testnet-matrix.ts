/**
 * The testnet matrix from ADR-2026-10-16 Decision 10.4. Each pair sends to the
 * signer's own address on the destination and passes when the destination
 * balance rises by at least the quote's `amountOut`.
 *
 *   pnpm test:testnet                        all six pairs
 *   pnpm test:testnet --pairs=Arc_Testnet>Base_Sepolia
 *   pnpm test:testnet --scenario=max-arc     Max on Arc leaves gas for the send
 *   pnpm test:testnet --scenario=burn-only   burns, then exits as a closed tab would
 *   pnpm test:testnet --scenario=resume      finishes what burn-only left
 *
 * Keys: WHISK_LIVE_PK (EVM), WHISK_SOLANA_PK, WHISK_STELLAR_SEED,
 * WHISK_STARKNET_ADDRESS and WHISK_STARKNET_PK. WHISK_RPC_<chain id>
 * overrides a chain's public RPC.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getChain } from "@usewhisk/cctp";
import {
  createStorageInflightStore,
  createWhisk,
  type Chain,
  type InflightStorage,
  type SendListeners,
  type SendResult,
  type WhiskAdapter,
  type WhiskConfig,
} from "../src/index.js";
import {
  MissingKeyError,
  rpcOverrides,
  usdcBalance,
  walletFor,
} from "./testnet/wallets.js";

const PAIRS: readonly (readonly [Chain, Chain])[] = [
  ["Arc_Testnet", "Base_Sepolia"],
  ["Base_Sepolia", "Arc_Testnet"],
  ["Ethereum_Sepolia", "Solana_Devnet"],
  ["Solana_Devnet", "Arc_Testnet"],
  ["Arc_Testnet", "Stellar_Testnet"],
  ["Arc_Testnet", "Starknet_Sepolia"],
];
const RESUME_PAIR = ["Arc_Testnet", "Base_Sepolia"] as const;
const BALANCE_WAIT_MS = 3 * 60_000;

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key = "", value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value] as const;
  }),
);
const AMOUNT = args.get("amount") ?? "1";
const INFLIGHT_FILE = resolve(
  process.env.WHISK_INFLIGHT_FILE ?? ".testnet-inflight.json",
);

type Outcome = { label: string; ok: boolean; detail: string };

const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(0)}s`;
const log = (label: string, line: string) =>
  console.log(`[${elapsed()}] ${label}: ${line}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function engineFor(chains: readonly Chain[], extra: Partial<WhiskConfig> = {}) {
  return createWhisk({
    chains: [...chains],
    rpcUrls: rpcOverrides(chains),
    ...extra,
  });
}

function stepLogger(label: string): SendListeners {
  return {
    onStep: (step) =>
      log(
        label,
        `${step.name} ${step.state}${step.txHash ? ` ${step.txHash}` : ""}`,
      ),
  };
}

/** Polls until the balance moves, since the mint can land before RPCs see it. */
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

function failed(label: string, result: SendResult): Outcome {
  if (result.kind === "success") throw new Error("not a failure");
  const burn = result.steps.find((s) => s.name === "burn")?.txHash;
  return {
    label,
    ok: false,
    detail: `${result.error.code}: ${result.error.message}${burn ? ` (burn ${burn})` : ""}`,
  };
}

async function runPair(source: Chain, destination: Chain): Promise<Outcome> {
  const label = `${source} -> ${destination}`;
  let payer: WhiskAdapter;
  let receiver: WhiskAdapter;
  try {
    payer = walletFor(source);
    receiver = walletFor(destination);
  } catch (error) {
    if (error instanceof MissingKeyError) {
      return { label, ok: false, detail: error.message };
    }
    throw error;
  }

  const engine = engineFor([source, destination]);
  const quote = await engine.quote({
    sourceChain: source,
    destinationChain: destination,
    recipient: { address: receiver.address, chain: destination },
    amount: AMOUNT,
    adapter: payer,
    destinationAdapter: receiver,
  });
  log(
    label,
    `${quote.feeMode}, ${quote.plan?.speed ?? "?"}, ${quote.plan?.mint.kind ?? "?"} mint, pay ${quote.amountIn}, receive at least ${quote.amountOut}`,
  );

  const before = await usdcBalance(destination, receiver.address);
  const result = await engine.send(
    { quote, adapter: payer, destinationAdapter: receiver },
    stepLogger(label),
  );
  if (result.kind !== "success") return failed(label, result);

  const received = await waitForCredit(destination, receiver.address, before);
  const ok = received >= quote.subunits.amountOut;
  return {
    label,
    ok,
    detail: `received ${received} of at least ${quote.subunits.amountOut} subunits, final tx ${result.finalTxHash ?? "none"}`,
  };
}

async function maxOnArc(): Promise<Outcome> {
  const label = "Max on Arc_Testnet";
  const chain: Chain = "Arc_Testnet";
  const wallet = walletFor(chain);
  const engine = engineFor([chain]);
  const params = {
    sourceChain: chain,
    destinationChain: chain,
    recipient: { address: wallet.address, chain },
    adapter: wallet,
  };
  const max = await engine.maxSendable(params);
  if (!max) return { label, ok: false, detail: "maxSendable returned null" };
  log(
    label,
    `balance ${max.balance}, gas reserve ${max.gasReserve}, max ${max.amount}`,
  );
  if (max.balance <= max.gasReserve) {
    return {
      label,
      ok: false,
      detail: "the wallet holds no more than the gas reserve",
    };
  }
  const quote = await engine.quote({ ...params, amount: max.amount });
  const result = await engine.send(
    { quote, adapter: wallet },
    stepLogger(label),
  );
  if (result.kind !== "success") return failed(label, result);
  const after = await usdcBalance(chain, wallet.address);
  const gasPaid = max.balance - after;
  return {
    label,
    ok: gasPaid <= max.gasReserve,
    detail: `gas paid ${gasPaid} of a ${max.gasReserve} reserve`,
  };
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

function resumeEngine() {
  return engineFor(RESUME_PAIR, {
    inflightStore: createStorageInflightStore(fileStorage(INFLIGHT_FILE)),
    // Without Circle's relay the mint is left for `resume` to sign.
    useForwarder: false,
  });
}

async function burnOnly(): Promise<never> {
  const [source, destination] = RESUME_PAIR;
  const label = `burn-only ${source} -> ${destination}`;
  const payer = walletFor(source);
  const receiver = walletFor(destination);
  const engine = resumeEngine();
  const quote = await engine.quote({
    sourceChain: source,
    destinationChain: destination,
    recipient: { address: receiver.address, chain: destination },
    amount: AMOUNT,
    adapter: payer,
    destinationAdapter: receiver,
  });
  await engine.send(
    { quote, adapter: payer, destinationAdapter: receiver },
    {
      onStep: async (step) => {
        log(label, `${step.name} ${step.state}`);
        if (step.name !== "burn" || step.state !== "success") return;
        const records = await engine.inflight();
        const record = records.find((r) => r.id === quote.id);
        log(label, `exiting with record ${record?.id} at ${record?.step}`);
        process.exit(record?.step === "burned" ? 0 : 1);
      },
    },
  );
  log(label, "the send finished before the burn was reported");
  process.exit(1);
}

async function resumeAll(): Promise<Outcome[]> {
  const engine = resumeEngine();
  const records = await engine.inflight();
  if (records.length === 0) {
    return [
      { label: "resume", ok: false, detail: `no records in ${INFLIGHT_FILE}` },
    ];
  }
  const outcomes: Outcome[] = [];
  for (const record of records) {
    const label = `resume ${record.sourceChain} -> ${record.destinationChain} ${record.sourceTxHash ?? ""}`;
    const receiver = walletFor(record.destinationChain);
    const before = await usdcBalance(record.destinationChain, receiver.address);
    const result = await engine.resume(
      record,
      { destinationAdapter: receiver },
      stepLogger(label),
    );
    if (result.kind !== "success") {
      outcomes.push(failed(label, result));
      continue;
    }
    const received = await waitForCredit(
      record.destinationChain,
      receiver.address,
      before,
    );
    const ok = received > 0n && received <= BigInt(record.amountBurned);
    if (ok) await engine.dismiss(record.id);
    outcomes.push({
      label,
      ok,
      detail: `received ${received} subunits, mint ${result.finalTxHash ?? "none"}`,
    });
  }
  return outcomes;
}

function selectedPairs(): readonly (readonly [Chain, Chain])[] {
  const raw = args.get("pairs");
  if (!raw) return PAIRS;
  return raw.split(",").map((pair) => {
    const [source, destination] = pair.split(">");
    getChain(source as Chain);
    getChain(destination as Chain);
    return [source as Chain, destination as Chain] as const;
  });
}

async function guarded(
  label: string,
  run: () => Promise<Outcome | Outcome[]>,
): Promise<Outcome[]> {
  try {
    return [await run()].flat();
  } catch (error) {
    return [
      {
        label,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      },
    ];
  }
}

async function main(): Promise<Outcome[]> {
  const scenario = args.get("scenario") ?? "pairs";
  switch (scenario) {
    case "pairs": {
      const outcomes: Outcome[] = [];
      for (const [source, destination] of selectedPairs()) {
        outcomes.push(
          ...(await guarded(`${source} -> ${destination}`, () =>
            runPair(source, destination),
          )),
        );
      }
      return outcomes;
    }
    case "max-arc":
      return guarded("Max on Arc_Testnet", maxOnArc);
    case "burn-only":
      return guarded("burn-only", burnOnly);
    case "resume":
      return guarded("resume", resumeAll);
    default:
      throw new Error(`Unknown scenario ${scenario}.`);
  }
}

const outcomes = await main();
console.log("");
for (const o of outcomes) {
  console.log(`${o.ok ? "PASS" : "FAIL"} ${o.label}: ${o.detail}`);
}
process.exit(outcomes.every((o) => o.ok) ? 0 : 1);
