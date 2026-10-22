import type { Chain } from "./chain.js";
import type { ResolvedRecipient } from "./recipient.js";

export type ResolverContext = {
  chain: Chain;
};

export type Resolver = {
  name: string;

  /** Synchronous shape check. Only resolvers that match are asked to resolve. */
  matches: (input: string) => boolean;

  /** Return `null` to let the next resolver try. Throw `ResolverError` on unexpected failure. */
  resolve: (
    input: string,
    ctx: ResolverContext,
  ) => Promise<ResolvedRecipient | null>;
};
