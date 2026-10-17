#!/usr/bin/env bash
set -euo pipefail

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "secrets: gitleaks is not installed. Install it with 'brew install gitleaks' (or see https://github.com/gitleaks/gitleaks#installing), then commit again." >&2
  exit 1
fi

gitleaks git --pre-commit --staged --redact --no-banner .
