import { test } from "node:test";
import assert from "node:assert/strict";
import { collect, evaluate, readExceptions } from "./audit.mjs";

const GHSA = "GHSA-mrhx-c7xc-m3w5";

function advisory(severity, versions, ghsa = GHSA, module_name = "zod") {
  return {
    github_advisory_id: ghsa,
    module_name,
    severity,
    title: "Zod can exhaust memory",
    findings: versions.map((version) => ({
      version,
      paths: [`packages__react>${module_name}`],
    })),
  };
}

const report = (...advisories) => ({
  advisories: Object.fromEntries(advisories.map((a, i) => [String(i), a])),
});

const leaf = (version) => ({ zod: { from: "zod", version } });

const tree = (name, version, dependencies) => ({
  [name]: { from: name, version, dependencies },
});

const appkit = (version) =>
  tree("wagmi", "2.19.5", tree("@reown/appkit-wallet", "1.7.8", leaf(version)));

const why = (...importers) =>
  importers.map(([name, dependencies]) => ({
    name,
    version: "0.0.0",
    private: false,
    ...(dependencies ? { dependencies } : {}),
  }));

const exception = {
  ghsa: GHSA,
  package: "zod",
  version: "3.22.4",
  dependent: "@reown/appkit-wallet",
  reason: "Only parses messages for a wallet frame Whisk never starts.",
};

const run = (auditReport, whyFor, exceptions) =>
  evaluate(collect(auditReport, whyFor), exceptions);

test("passes when every dependent of a vulnerable version is listed", () => {
  const result = run(
    report(advisory("high", ["3.22.4"])),
    () =>
      why(
        ["@usewhisk/react", appkit("3.22.4")],
        ["@usewhisk/docs", tree("@usewhisk/react", "link:", appkit("3.22.4"))],
      ),
    [exception],
  );
  assert.deepEqual(result, []);
});

test("fails a second dependent hidden behind a covered one", () => {
  const result = run(
    report(advisory("high", ["3.22.4"])),
    () =>
      why(
        ["@usewhisk/react", appkit("3.22.4")],
        ["@usewhisk/core", leaf("3.22.4")],
      ),
    [exception],
  );
  assert.equal(result.length, 1);
  assert.match(result[0], /not covered/);
  assert.match(result[0], /via @usewhisk\/core/);
  assert.match(result[0], /@usewhisk\/core>zod/);
});

test("fails an exception whose dependent no longer links the version", () => {
  const result = run(
    report(advisory("high", ["3.22.4"])),
    () => why(["@usewhisk/react", appkit("3.22.4")]),
    [exception, { ...exception, dependent: "abitype" }],
  );
  assert.equal(result.length, 1);
  assert.match(result[0], /stale/);
  assert.match(result[0], /via abitype/);
});

test("fails an exception once the advisory is gone", () => {
  const result = run(report(), () => why(), [exception]);
  assert.equal(result.length, 1);
  assert.match(result[0], /stale/);
});

test("matches the vulnerable version exactly", () => {
  const result = run(
    report(advisory("critical", ["3.22.5"])),
    () => why(["@usewhisk/react", appkit("3.22.5")]),
    [exception],
  );
  assert.equal(result.filter((p) => /not covered/.test(p)).length, 1);
  assert.equal(result.filter((p) => /stale/.test(p)).length, 1);
});

test("asks pnpm why about each vulnerable version once", () => {
  const asked = [];
  collect(
    report(
      advisory("high", ["3.22.4", "3.25.76"]),
      advisory("moderate", ["1.0.0"], "GHSA-x", "left-pad"),
    ),
    (name, version) => {
      asked.push(`${name}@${version}`);
      return why(["@usewhisk/react", leaf(version)]);
    },
  );
  assert.deepEqual(asked, ["zod@3.22.4", "zod@3.25.76"]);
});

test("leaves moderate and low findings to Dependabot", () => {
  const result = run(
    report(
      advisory("moderate", ["1.0.0"], "GHSA-x"),
      advisory("low", ["1.0.0"], "GHSA-y"),
    ),
    () => assert.fail("pnpm why should not run"),
    [],
  );
  assert.deepEqual(result, []);
});

test("refuses a vulnerable version pnpm why cannot find", () => {
  assert.throws(
    () =>
      collect(report(advisory("high", ["3.22.4"])), () =>
        why(["@usewhisk/react"], ["@usewhisk/core"]),
      ),
    /pnpm why found nothing linking zod@3.22.4/,
  );
});

test("refuses pnpm why output it cannot read", () => {
  for (const bad of [
    null,
    {},
    "oops",
    [{ version: "1.0.0" }],
    [{ name: "@usewhisk/react", dependencies: { zod: "3.22.4" } }],
    [{ name: "@usewhisk/react", dependencies: { zod: {} } }],
  ]) {
    assert.throws(
      () => collect(report(advisory("high", ["3.22.4"])), () => bad),
      /pnpm why output/,
    );
  }
});

test("refuses audit output it cannot read", () => {
  for (const bad of [
    null,
    "oops",
    {},
    { error: { code: "ERR_PNPM_AUDIT_BAD_RESPONSE" } },
    { advisories: { 1: { severity: "high" } } },
    { advisories: { 1: { ...advisory("high", []), findings: [{}] } } },
  ]) {
    assert.throws(() => collect(bad, () => why()), /audit output/);
  }
});

test("refuses an exception without a reason or a dependent", () => {
  for (const bad of [
    [{ ...exception, reason: "" }],
    [{ ...exception, dependent: undefined }],
    [{ ...exception, dependent: " " }],
    { exceptions: [] },
  ]) {
    assert.throws(() => readExceptions(JSON.stringify(bad)), /exception/);
  }
  assert.deepEqual(readExceptions(JSON.stringify([exception])), [exception]);
});
