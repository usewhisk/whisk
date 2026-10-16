# ADR for Dummies: Phase 1, Foundation

- **Status:** Proposed, awaiting maintainer approval
- **Date:** 2026-10-16

## The Idea

Before Whisk gets a dashboard, plans or new apps, the payment engine underneath has to
be right. Phase 1 fixes every money-safety problem found in the rebuilt engine, adds
Arc and about thirteen more blockchains, and publishes the result as a new version of
the free SDK.

## What the Person Sees

**A payer:**

1. Opens a payment form that defaults to Arc and lists about 30 blockchains.
2. Sees the exact fee before signing. The amount they sign is the amount they were
   shown; if fees moved, they are asked again instead of being charged more.
3. Gets a clear message if a route cannot work, before anything leaves their wallet.
4. If they close the tab mid-transfer, the form offers "Resume" when they come back,
   and the receipt link can finish the transfer from anywhere.
5. On a dark website, the form and its pop-ups match the site.

**A developer:**

1. Installs version `0.2.0`, picks chains by the same names Circle uses, and never sets
   a "mainnet or testnet" switch again. Whisk reads it from the chain.
2. Can send to Stellar and Starknet addresses, which the form currently rejects.

## Important Limitation

- No dashboard, app ID, team plans or hosted checkout yet. Those are Phase 2 and later.
- Sui, Aptos and BNB Chain are not added in this phase.
- Some chains only support Circle's slower transfer mode, which takes 13 to 19
  minutes. Whisk will support them and say so, instead of hiding them.
- People on the current `0.1.0` version have a small upgrade to make; a migration page
  explains it.

## What Changes

- **Problems that could lose or misprice money are fixed, each proven by a test first:**
  - mainnet and testnet could get mixed up;
  - one route could burn money and then stop;
  - fees could be rounded the wrong way;
  - a closed tab could lose track of a transfer;
  - the charged fee could differ from the shown fee.
- **Other bugs are fixed:**
  - Stellar and Starknet addresses are accepted;
  - Arc works;
  - errors show on screen;
  - pop-ups keep the theme.
- **One list of chains.** It replaces two lists that disagreed.
- **Wider coverage:**
  - Arc mainnet and testnet are added, and Arc becomes the default.
  - About thirteen more chains are added, on mainnet and testnet.
  - A nightly check confirms every chain's contract addresses are real.
- **Tests that send real money.** Every transfer route gets a test, plus a nightly set
  of real testnet transfers. The maintainer sends two 1 USDC mainnet transfers before
  release.
- **Leaving this repo:**
  - The old dashboard prototype moves to the private platform repo, where its security
    holes are fixed before it is ever put online.
  - The docs move to the new docs site.
- **Code comments** are cleaned up to the project's human-comments rule.
- The packages are published automatically from GitHub with a signed record of where
  they were built.

## What Does Not Change

- Whisk stays free, open source and non-custodial.
- Circle's transfer system (CCTP) stays the engine; there is no return to App Kit.
- The fund-safety rules stay: nothing is sent before every check passes, every
  transfer can be recovered, and money is never rounded with decimals.
- Every later phase still gets its own pair of decision documents and approval.
