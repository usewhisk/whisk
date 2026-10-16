#!/usr/bin/env bash
set -euo pipefail

# Hooks run with a minimal PATH; make the toolchain visible.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
command -v mise >/dev/null 2>&1 && eval "$(mise activate bash --shims)"

BLUE='\033[0;34m'; GREEN='\033[0;32m'; NC='\033[0m'

SKIP_BUILD="${SKIP_BUILD:-false}"
if [ "${1:-}" = "--fast" ]; then SKIP_BUILD="true"; fi

echo -e "${BLUE}=== Governance Preflight ===${NC}"

echo -e "\n${BLUE}[1/5] Format check...${NC}"; pnpm format:check
echo -e "\n${BLUE}[2/5] Lint...${NC}";         pnpm lint

# Apps and examples resolve package types from dist, so the packages are built first.
echo -e "\n${BLUE}[3/5] Typecheck...${NC}";    pnpm build && pnpm typecheck
echo -e "\n${BLUE}[4/5] Tests...${NC}";        pnpm test

if [ "$SKIP_BUILD" = "true" ]; then
  echo -e "\n${BLUE}[5/5] Build (skipped in --fast mode)${NC}"
else
  echo -e "\n${BLUE}[5/5] Production build...${NC}"; pnpm build:apps
fi

echo -e "\n${GREEN}All preflight gates passed.${NC}"
