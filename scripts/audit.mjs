#!/usr/bin/env node
// Fails on any high or critical advisory unless audit-exceptions.json accepts
// every package that links the vulnerable version. An exception that matches
// nothing fails too, so the list is pruned once upstream ships a fix.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BLOCKING = new Set(["high", "critical"]);
const FIELDS = ["ghsa", "package", "version", "dependent", "reason"];
const DEPENDENCY_KEYS = [
  "dependencies",
  "optionalDependencies",
  "devDependencies",
];

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

function readAdvisories(report) {
  const advisories = report?.advisories;
  if (typeof advisories !== "object" || advisories === null) {
    throw new Error("Unreadable pnpm audit output: no advisories.");
  }
  const vulnerable = [];
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
      if (typeof f?.version !== "string") {
        throw new Error("Unreadable pnpm audit output: malformed finding.");
      }
      vulnerable.push({
        ghsa: a.github_advisory_id,
        package: a.module_name,
        severity: a.severity,
        title: a.title ?? "",
        version: f.version,
      });
    }
  }
  return vulnerable.filter((v) => BLOCKING.has(v.severity));
}

// pnpm audit prints one path per vulnerable version, so the dependents come
// from pnpm why, which prints them all.
function readDependents(output, name, version) {
  if (!Array.isArray(output)) {
    throw new Error(
      "Unreadable pnpm why output: expected a list of importers.",
    );
  }
  const dependents = new Map();
  const walk = (parent, node, trail) => {
    for (const key of DEPENDENCY_KEYS) {
      const children = node[key];
      if (children === undefined) continue;
      if (typeof children !== "object" || children === null) {
        throw new Error(`Unreadable pnpm why output: ${key} of ${parent}.`);
      }
      for (const [child, entry] of Object.entries(children)) {
        if (typeof entry?.version !== "string") {
          throw new Error(`Unreadable pnpm why output: ${child} in ${parent}.`);
        }
        const path = [...trail, child];
        if (child === name && entry.version === version) {
          if (!dependents.has(parent)) dependents.set(parent, path.join(">"));
        } else {
          walk(child, entry, path);
        }
      }
    }
  };
  for (const importer of output) {
    if (typeof importer?.name !== "string") {
      throw new Error("Unreadable pnpm why output: importer without a name.");
    }
    walk(importer.name, importer, [importer.name]);
  }
  return dependents;
}

/** Expands each blocking advisory into one finding per dependent. */
export function collect(report, whyFor) {
  const cache = new Map();
  const findings = [];
  for (const v of readAdvisories(report)) {
    const key = `${v.package}@${v.version}`;
    if (!cache.has(key)) {
      const dependents = readDependents(
        whyFor(v.package, v.version),
        v.package,
        v.version,
      );
      if (dependents.size === 0) {
        throw new Error(
          `pnpm why found nothing linking ${key}, which pnpm audit reported.`,
        );
      }
      cache.set(key, dependents);
    }
    for (const [dependent, path] of cache.get(key)) {
      findings.push({ ...v, dependent, path });
    }
  }
  return findings;
}

const same = (finding, exception) =>
  finding.ghsa === exception.ghsa &&
  finding.package === exception.package &&
  finding.version === exception.version &&
  finding.dependent === exception.dependent;

/** Returns one message per problem; empty means the audit passes. */
export function evaluate(findings, exceptions) {
  const problems = [];
  for (const f of findings) {
    if (!exceptions.some((e) => same(f, e))) {
      problems.push(
        `${f.severity} ${f.ghsa} in ${f.package}@${f.version} via ${f.dependent} is not covered, e.g. ${f.path} (${f.title})`,
      );
    }
  }
  for (const e of exceptions) {
    if (!findings.some((f) => same(f, e))) {
      problems.push(
        `Exception for ${e.ghsa} in ${e.package}@${e.version} via ${e.dependent} is stale and should be deleted.`,
      );
    }
  }
  return problems;
}

function pnpmJson(root, args) {
  const run = spawnSync("pnpm", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error) throw run.error;
  try {
    return { status: run.status, json: JSON.parse(run.stdout) };
  } catch (cause) {
    const output = (run.stderr || run.stdout).slice(0, 2000);
    throw new Error(
      `Unreadable pnpm ${args[0]} output (exit ${run.status}): ${output}`,
      { cause },
    );
  }
}

function main() {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const exceptions = readExceptions(
    readFileSync(new URL("../audit-exceptions.json", import.meta.url), "utf8"),
  );
  // pnpm audit exits non-zero whenever it finds anything, so its verdict comes
  // from the report, never the exit code.
  const audit = pnpmJson(root, ["audit", "--json"]).json;
  const whyFor = (name, version) => {
    const why = pnpmJson(root, ["why", `${name}@${version}`, "-r", "--json"]);
    if (why.status !== 0) {
      throw new Error(`pnpm why ${name}@${version} exited ${why.status}.`);
    }
    return why.json;
  };
  const problems = evaluate(collect(audit, whyFor), exceptions);
  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }
  console.log(
    `No unaccepted high or critical advisories. ${exceptions.length} exception(s) still apply.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
