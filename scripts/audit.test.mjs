import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, readExceptions } from "./audit.mjs";

const ZOD_PATH =
  "packages__react>wagmi>@wagmi/connectors>@walletconnect/ethereum-provider>@reown/appkit>@reown/appkit-wallet>zod";

function advisory(severity, findings, ghsa = "GHSA-mrhx-c7xc-m3w5") {
  return {
    github_advisory_id: ghsa,
    module_name: "zod",
    severity,
    title: "Zod can exhaust memory",
    findings,
  };
}

const report = (...advisories) => ({
  advisories: Object.fromEntries(advisories.map((a, i) => [String(i), a])),
});

const exception = {
  ghsa: "GHSA-mrhx-c7xc-m3w5",
  package: "zod",
  version: "3.22.4",
  path: ZOD_PATH,
  reason: "Only parses messages for a wallet frame Whisk never starts.",
};

test("passes when every high finding is a listed exception", () => {
  const result = evaluate(
    report(advisory("high", [{ version: "3.22.4", paths: [ZOD_PATH] }])),
    [exception],
  );
  assert.deepEqual(result, []);
});

test("fails a high finding on a path no exception lists", () => {
  const result = evaluate(
    report(
      advisory("high", [
        { version: "3.22.4", paths: [ZOD_PATH, "packages__core>zod"] },
      ]),
    ),
    [exception],
  );
  assert.equal(result.length, 1);
  assert.match(result[0], /GHSA-mrhx-c7xc-m3w5/);
  assert.match(result[0], /packages__core>zod/);
});

test("fails the listed path at a different version", () => {
  const result = evaluate(
    report(advisory("critical", [{ version: "3.22.5", paths: [ZOD_PATH] }])),
    [exception],
  );
  assert.equal(result.filter((p) => /not covered/.test(p)).length, 1);
  assert.equal(result.filter((p) => /stale/.test(p)).length, 1);
});

test("fails an exception that no longer matches anything", () => {
  const result = evaluate(report(), [exception]);
  assert.equal(result.length, 1);
  assert.match(result[0], /stale/);
  assert.match(result[0], /GHSA-mrhx-c7xc-m3w5/);
});

test("leaves moderate and low findings to Dependabot", () => {
  const result = evaluate(
    report(
      advisory("moderate", [{ version: "1.0.0", paths: ["a>b"] }], "GHSA-x"),
      advisory("low", [{ version: "1.0.0", paths: ["a>c"] }], "GHSA-y"),
    ),
    [],
  );
  assert.deepEqual(result, []);
});

test("refuses audit output it cannot read", () => {
  for (const bad of [
    null,
    "oops",
    {},
    { error: { code: "ERR_PNPM_AUDIT_BAD_RESPONSE" } },
    { advisories: { 1: { severity: "high" } } },
  ]) {
    assert.throws(() => evaluate(bad, []), /audit output/);
  }
});

test("refuses an exception without a reason or an exact path", () => {
  for (const bad of [
    [{ ...exception, reason: "" }],
    [{ ...exception, path: undefined }],
    { exceptions: [] },
  ]) {
    assert.throws(() => readExceptions(JSON.stringify(bad)), /exception/);
  }
  assert.deepEqual(readExceptions(JSON.stringify([exception])), [exception]);
});
