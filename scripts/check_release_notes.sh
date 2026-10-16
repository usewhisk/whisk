#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
BASE="${RELEASE_NOTES_BASE:-origin/main}"
APP_PATHS='^(packages|apps|examples)/'

# Bot branches cannot write prose. Changesets version PRs and Dependabot bumps are
# reviewed by a human before merge instead.
HEAD_REF="${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD)}"
case "$HEAD_REF" in
  changeset-release/* | dependabot/*)
    echo -e "${GREEN}Bot branch ${HEAD_REF}. Release note not required.${NC}"
    exit 0
    ;;
esac

if ! git fetch -q origin "${BASE#origin/}"; then
  echo -e "${YELLOW}Could not fetch ${BASE}; comparing against the local ref.${NC}"
fi

CHANGED=$(git diff --name-only "$BASE...HEAD")
CHANGED_APP_FILES=$(echo "$CHANGED" | grep -E "$APP_PATHS" || true)
RELEASE_NOTES=$(echo "$CHANGED" | grep -E '^docs/release-notes/.+\.md$' | grep -v 'TEMPLATE\.md$' || true)

if [ -z "$CHANGED_APP_FILES" ]; then
  echo -e "${GREEN}No application code changed. Release note not required.${NC}"
  exit 0
fi

if [ -z "$RELEASE_NOTES" ]; then
  echo -e "${YELLOW}Application code changed but no release note was added under docs/release-notes/${NC}"
  echo "$CHANGED_APP_FILES" | sed 's/^/  - /'
  echo -e "${YELLOW}Add docs/release-notes/<date>-<feature>.md${NC}"
  if [ "${STRICT_RELEASE_NOTES:-false}" = "true" ]; then
    echo -e "${RED}Release notes check failed in strict mode.${NC}"
    exit 1
  fi
  exit 0
fi

echo -e "${GREEN}Release note found. Gate passed.${NC}"
