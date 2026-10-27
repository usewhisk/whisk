#!/usr/bin/env node
// Fails on any high or critical advisory unless audit-exceptions.json accepts
// that exact package version on that exact dependency path. An exception that
// matches nothing fails too, so the list is pruned once upstream ships a fix.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BLOCKING = new Set(["high", "critical"]);
const FIELDS = ["ghsa", "package", "version", "path", "reason"];

export function readExceptions(text) {
  const list = JSON.parse(text);
  if (!Array.isArray(list)) {
    throw new Error("audit-exceptions.json must be an array of exceptions.");
  }
  for (const [i, entry] of list.entries()) {
    const missing = FIELDS.filter(
      (f) => typeof entry?.[f] !== "string" || entry[f].trim() === "",
    );
    if (missing.length > 0) {
      throw new Error(
        `audit exception ${i} needs a non-empty ${missing.join(", ")}.`,
      );
    }
  }
  return list;
}

function readFindings(report) {
  const advisories = report?.advisories;
  if (typeof advisories !== "object" || advisories === null) {
    throw new Error("Unreadable pnpm audit output: no advisories.");
  }
  const findings = [];
  for (const a of Object.values(advisories)) {
    if (
      typeof a?.github_advisory_id !== "string" ||
      typeof a.module_name !== "string" ||
      typeof a.severity !== "string" ||
      !Array.isArray(a.findings)
    ) {
      throw new Error("Unreadable pnpm audit output: malformed advisory.");
    }
    for (const f of a.findings) {
      if (typeof f?.version !== "string" || !Array.isArray(f.paths)) {
        throw new Error("Unreadable pnpm audit output: malformed finding.");
      }
      for (const path of f.paths) {
        findings.push({
          ghsa: a.github_advisory_id,
          package: a.module_name,
          severity: a.severity,
          title: a.title ?? "",
          version: f.version,
          path,
        });
      }
    }
  }
  return findings;
}

const same = (finding, exception) =>
  finding.ghsa === exception.ghsa &&
  finding.package === exception.package &&
  finding.version === exception.version &&
  finding.path === exception.path;

/** Returns one message per problem; empty means the audit passes. */
export function evaluate(report, exceptions) {
  const blocking = readFindings(report).filter((f) => BLOCKING.has(f.severity));
  const problems = [];
  for (const f of blocking) {
    if (!exceptions.some((e) => same(f, e))) {
      problems.push(
        `${f.severity} ${f.ghsa} in ${f.package}@${f.version} is not covered: ${f.path} (${f.title})`,
      );
    }
  }
  for (const e of exceptions) {
    if (!blocking.some((f) => same(f, e))) {
      problems.push(
        `Exception for ${e.ghsa} in ${e.package}@${e.version} is stale and should be deleted: ${e.path}`,
      );
    }
  }
  return problems;
}

function main() {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const exceptions = readExceptions(
    readFileSync(new URL("../audit-exceptions.json", import.meta.url), "utf8"),
  );
  // pnpm exits non-zero whenever it finds anything, so the verdict comes from
  // the report, never the exit code.
  const run = spawnSync("pnpm", ["audit", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error) throw run.error;
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch (cause) {
    const output = (run.stderr || run.stdout).slice(0, 2000);
    throw new Error(
      `Unreadable pnpm audit output (exit ${run.status}): ${output}`,
      { cause },
    );
  }
  const problems = evaluate(report, exceptions);
  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }
  console.log(
    `No unaccepted high or critical advisories. ${exceptions.length} exception(s) still apply.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
