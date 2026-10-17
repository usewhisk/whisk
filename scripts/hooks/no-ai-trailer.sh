#!/usr/bin/env bash
# Usage: no-ai-trailer.sh <commit-message-file>
set -euo pipefail

msg_file="$1"
pattern='^co-authored-by:.*(claude|anthropic|copilot|openai|chatgpt|gpt-|gemini|codex|cursor|devin|qwen)|generated (with|by) .*(claude|copilot|chatgpt|gemini|codex|cursor)'

if grep -viE '^#' "$msg_file" | grep -qiE "$pattern"; then
  echo "no-ai-trailer: the commit message credits an AI tool. Remove the trailer or footer." >&2
  exit 1
fi
