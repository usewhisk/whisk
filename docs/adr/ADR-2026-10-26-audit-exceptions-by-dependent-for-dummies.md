# ADR for Dummies: Audit exceptions by dependent

- **Status:** Accepted (2026-10-26)
- **Date:** 2026-10-26

## What Went Wrong

The security check we added today accepts a known problem only at one exact spot in
our third-party code. To find those spots it asks pnpm, the package tool. pnpm only
ever shows one spot per problem, even when there are dozens, and which one it shows
can change.

When we brought pull request #176 up to date, pnpm happened to show a different spot.
The check failed even though nothing had changed. Worse, the same blind spot means a
real new problem could hide behind a spot we had already accepted.

## What We Do

1. Ask pnpm for every spot, using a different pnpm command that lists them all.
2. Accept a problem per library that loads the risky code, not per route to it. Each
   library still needs a written reason.
3. Keep the rules: anything new fails, anything no longer there must be removed, and
   anything the check cannot read fails.

## Why Per Library

There are 150 to 200 routes to the same three libraries. Listing every route would
mean rewriting the list every time a wallet library updates, and nobody would read
it. What matters is which library actually runs the risky code, and that only
changes rarely.

## What Changes

- The check gives the same answer no matter how the package list is ordered.
- Two new entries for `abitype`, a library that lists zod but only uses it in a part
  nobody in Whisk loads.
- #176 can be brought up to date and go green.

## What Does Not Change

- Whisk's published packages.
- How payers and merchants use Whisk.
