#!/usr/bin/env bash
set -euo pipefail

# Clones made while husky was in use still point git at its hooks directory.
if [ "$(git config --local --get core.hooksPath || true)" = ".husky/_" ]; then
  git config --local --unset core.hooksPath
fi

pnpm exec lefthook install
