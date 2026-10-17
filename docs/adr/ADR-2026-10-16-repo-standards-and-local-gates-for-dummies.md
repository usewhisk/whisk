# ADR for Dummies: Repository standards and local quality gates

- **Status:** Accepted by the maintainer on 2026-10-17
- **Date:** 2026-10-16

## The Idea

GitHub only guards the main branch of private repositories on a paid plan. Whisk is not
paying for that yet. So every repository gets automatic checks that run on the
developer's own computer before code can be committed or pushed, plus checks on GitHub
that flag anything that slips through. Every repository is also set up the same way,
with the same kind of README, licence, templates and settings.

## What the Person Sees

**A developer working on any Whisk repository:**

1. Clones it and runs `pnpm install`. The checks switch themselves on.
2. Commits. In a few seconds the files are tidied, and the commit is refused if it
   contains:
   - a password or key;
   - an em-dash;
   - a type-check escape hatch.
3. Writes a commit message. It is refused unless it follows the standard format (for
   example `fix(core): ...`) and has no AI credit line.
4. Pushes. The push is refused if it targets the main branch directly, if the branch
   name is sloppy, or if formatting, linting, type checks or tests fail.
5. Opens a pull request. GitHub runs the same checks again and shows a green or red
   result.

**The maintainer:**

1. Merges only green pull requests. On the public repositories GitHub enforces this.
2. Gets an automatic issue if anything ever lands on a private repository's main branch
   without going through a pull request, or breaks it.

## Important Limitation

- On the two private repositories (the platform and the website), someone with access
  could still skip the local checks on purpose. Nothing free can make that impossible.
  What this plan does is make it impossible to miss: GitHub re-checks, and a broken
  main branch raises an alarm.
- Developers need one small free tool (gitleaks) installed to find secrets. If it is
  missing, the check stops and says how to install it.

## What Changes

- **Lefthook** runs the checks in every repository. It replaces the two tools
  (husky and lint-staged) that `whisk` uses today.
- **One shared set of GitHub checks** lives in the org's `.github` repository and is
  used by all five repositories.
- **Every repository gets the standard files:**
  - a proper README and licence;
  - security and contribution guides;
  - issue and pull request templates;
  - an owner file;
  - automatic dependency updates;
  - the AI rulebook.
- **The same labels and settings everywhere.** The settings (descriptions, websites,
  topics, merge rules, security alerts) are already applied.
- **An org profile page** introduces Whisk on GitHub.

## What Does Not Change

- The public `whisk` repository keeps the strict GitHub protection it has today.
- No product code changes. This is how code gets in, not what the code does.
- If Whisk later pays for GitHub Team, the only change is turning on GitHub's own
  protection for the private repositories.
