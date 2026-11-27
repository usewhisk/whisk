# ADR for Dummies: USDC only, no swap

- **Status:** Accepted 2026-11-27
- **Date:** 2026-11-27

## The Idea

Whisk does one job: it moves USDC from one chain to another. It will not trade
one token for another. The swap feature was taken out of the code in 0.2, but
the website and a few files still talk about it. This change removes those
leftovers and says plainly that swap is not coming back.

## What the Person Sees

1. A developer opens the Whisk website. It says Whisk moves USDC across chains.
   It no longer mentions swaps, a "Swap tab" or a Circle App Kit key.
2. They follow the setup steps. There is no key to fetch, because Whisk never
   needed one after 0.2.
3. They open the playground. Its setup file no longer asks for a kit key.
4. They read the roadmap. Swap is listed as not planned, with the reason.

## Important Limitation

If a payer holds a token other than USDC, Whisk cannot convert it for them.
They need to swap it to USDC first, in their own wallet or another app.

## What Changes

- The website's descriptions and the home page sections.
- The playground's setup file and its readme.
- Some unused styling and one unused error message inside the packages, shipped
  as a small patch release.
- The roadmap.
- A check that fails if swap claims creep back into the website.

## What Does Not Change

- How a payment works, what it costs, or which chains are supported.
- Any code a developer calls. Nothing they import is renamed or removed.
- Whisk Cloud.
- Old release notes and the upgrade guide, which are history.
