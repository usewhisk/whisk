# ADR for Dummies: AI governance for Whisk

- **Status:** Proposed, awaiting maintainer approval
- **Date:** 2026-10-15

## The Idea

AI agents write a lot of Whisk's code, and Whisk moves people's money. This sets house
rules: the agent writes down what it wants to build and waits for your yes, works on a
separate copy of the code, proves bugs with a failing test before fixing them, and
cannot hand anything over until an automatic checklist passes.

## What the Person Sees

1. You ask for a feature. The agent replies with two short documents: a technical one
   and a plain-English one like this. Nothing is built yet.
2. You say "I approve". Only then does the agent start, on its own branch.
3. Before the agent can push, your machine runs the checks automatically.
4. The pull request on GitHub shows a single green "quality" check when everything
   passed, plus a filled-in checklist and a release note.
5. You merge. The agent never merges or pushes to `main` itself.

## Important Limitation

The lint check is thin for now: there is no ESLint setup in the repo yet, so it only
catches type errors. Adding a real linter is its own decision for later.

## What Changes

- New rulebook files: `AGENTS.md`, `CLAUDE.md`, and an engineering standards guide.
- No AI-sounding comments in the code. Comments only where a human would need them.
- A check runs when you push, and GitHub runs the same checks plus a release-note
  check on every pull request.
- A new pull request template with a money-safety section.
- You flip one GitHub setting so "quality" is the required check and only squash
  merges are allowed.

## What Does Not Change

- The packages, their APIs, and anything published to npm.
- How releases are cut (changesets and the release workflow).
- Your local setup, apart from the push check.
