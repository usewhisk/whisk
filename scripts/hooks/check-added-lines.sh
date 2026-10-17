#!/usr/bin/env bash
# Usage: check-added-lines.sh <file>...
# Fails when a staged file adds an em-dash, or adds a type-check escape in TypeScript.
set -euo pipefail

[ "$#" -eq 0 ] && exit 0

status=0
for file in "$@"; do
  case "$file" in
    pnpm-lock.yaml | package-lock.json | yarn.lock | *.svg | *.png | *.jpg | *.ico | *.woff | *.woff2) continue ;;
  esac

  added="$(git diff --cached --no-color -U0 -- "$file" | grep -E '^\+' | grep -vE '^\+\+\+ ' || true)"
  [ -z "$added" ] && continue

  if printf '%s\n' "$added" | grep -q $'\xe2\x80\x94'; then
    echo "em-dash: $file adds an em-dash. Use a comma, a colon or two sentences instead." >&2
    status=1
  fi

  case "$file" in
    *.ts | *.tsx | *.mts | *.cts)
      if printf '%s\n' "$added" | grep -qE '@ts-ignore|@ts-nocheck|\bas any\b'; then
        echo "type-escape: $file adds @ts-ignore, @ts-nocheck or 'as any'. Fix the type instead." >&2
        status=1
      fi
      ;;
  esac
done

exit "$status"
