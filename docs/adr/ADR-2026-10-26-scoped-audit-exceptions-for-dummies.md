# ADR for Dummies: Scoped audit exceptions

- **Status:** Accepted (2026-10-26)
- **Date:** 2026-10-26

## The Idea

Every pull request checks Whisk's third-party code against a public list of known
security problems. A new problem was found in a library called zod, and the check now
fails for everyone. Two copies can be updated. The third sits inside WalletConnect,
whose makers have not shipped a fix yet.

## What We Do

1. Update or remove every copy we can.
2. For the one we cannot fix, write down exactly where it is, why it is safe for
   Whisk, and accept only that one spot.
3. Teach the check to fail again if the problem shows up anywhere else, and to tell
   us when an accepted spot is no longer there, so the list cleans itself up.

## Why Not Just Switch It Off

The quick fix is to tell the check to ignore this problem everywhere. That would also
hide it if it ever reached Whisk's own code, and nobody would remember to switch it
back on. One of the two problems already ignored this way turned out to be gone
without anyone noticing.

## What Changes

- The check is green again.
- Accepted risks are listed in one file, each with its reason.
- When WalletConnect fixes its copy, the check asks us to remove the exception.

## What Does Not Change

- Whisk's published packages.
- How payers and merchants use Whisk.
- Smaller warnings still go through Dependabot.
