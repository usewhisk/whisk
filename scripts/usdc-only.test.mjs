import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");

function files(path, pattern) {
  const full = join(root, path);
  if (!statSync(full).isDirectory()) return [full];
  return readdirSync(full, { recursive: true })
    .map((name) => join(full, String(name)))
    .filter((name) => pattern.test(name) && statSync(name).isFile());
}

function offending(paths, banned, allowed = []) {
  const found = [];
  for (const file of paths) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (allowed.some((ok) => ok.test(line))) return;
        for (const pattern of banned) {
          if (pattern.test(line)) {
            found.push(
              `${relative(root, file)}:${String(i + 1)}: ${line.trim()}`,
            );
          }
        }
      });
  }
  return found;
}

// Whisk moves USDC between chains and does not swap tokens
// (docs/adr/ADR-2026-11-27-usdc-only-no-swap.md).
test("the docs site's pages and metadata make no swap or App Kit claim", () => {
  const paths = [
    ...files("apps/docs/src/components/marketing", /\.tsx$/),
    ...files("apps/docs/src/components/shared", /\.tsx$/),
    ...files("apps/docs/src/app/layout.tsx", /\.tsx$/),
  ];
  assert.deepEqual(
    offending(
      paths,
      [
        /SwapTab/,
        /useWhiskSwap/,
        /kitKey/i,
        /kit key/i,
        /App Kit/,
        /\bswaps?\b/i,
      ],
      [/display: "swap"/],
    ),
    [],
  );
});

test("no doc links to a swap hook", () => {
  assert.deepEqual(
    offending(files("apps/docs/src/content", /\.mdx$/), [
      /use-whisk-swap/,
      /useWhiskSwap/,
      /SwapTab/,
    ]),
    [],
  );
});

test("the playground documents no kit key or swap tab", () => {
  assert.deepEqual(
    offending(
      [
        ...files("examples/playground/.env.example", /./),
        ...files("examples/playground/README.md", /./),
      ],
      [/KIT_KEY/, /kit key/i, /\bswap\b/i],
    ),
    [],
  );
});

test("the widget's styles ship no swap classes", () => {
  assert.deepEqual(
    offending(files("packages/react/src", /\.css$/), [/whisk-swap/]),
    [],
  );
});

test("the roadmap plans no swap", () => {
  assert.deepEqual(offending(files("ROADMAP.md", /./), [/^#+ .*swap/i]), []);
});
