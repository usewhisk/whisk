#!/usr/bin/env bash
# Reads git's pre-push lines on stdin: <local ref> <local sha> <remote ref> <remote sha>
set -euo pipefail

branch_re='^(feat|fix|docs|chore|refactor|test|ci|perf|build|release|revert)/[a-z0-9][a-z0-9._/-]*$'
zero='0000000000000000000000000000000000000000'
status=0

while read -r local_ref local_sha remote_ref _remote_sha; do
  [ -z "${local_ref:-}" ] && continue

  if [ "$remote_ref" = "refs/heads/main" ]; then
    echo "protect-main: pushing to main is not allowed. Push a branch and open a pull request." >&2
    status=1
    continue
  fi

  [ "$local_sha" = "$zero" ] && continue

  case "$remote_ref" in
    refs/heads/*)
      branch="${remote_ref#refs/heads/}"
      if ! printf '%s' "$branch" | grep -qE "$branch_re"; then
        echo "branch-name: '$branch' must look like <type>/<kebab-description>, for example fix/arc-gas-floor." >&2
        echo "  types: feat fix docs chore refactor test ci perf build release revert" >&2
        status=1
      fi
      ;;
  esac
done

exit "$status"
