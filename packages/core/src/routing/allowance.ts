import { attestationSeconds, getFastBurnAllowance } from "@usewhisk/cctp";
import type { RoutePlan } from "./plan.js";

/**
 * Circle attests a Fast burn above its remaining Fast allowance as Standard,
 * and its quote API refuses to sell that Fast fee. Planning such a burn as
 * Standard keeps the ETA honest and the payer from paying for speed.
 */
export async function fitFastAllowance(
  plan: RoutePlan,
  burnAmount: bigint,
  fetch?: typeof globalThis.fetch,
): Promise<RoutePlan> {
  if (plan.speed !== "fast") return plan;
  const allowance = await getFastBurnAllowance(
    plan.network,
    fetch ? { fetch } : {},
  );
  if (burnAmount <= allowance) return plan;
  return {
    ...plan,
    speed: "standard",
    etaSeconds: attestationSeconds(plan.source, "standard"),
  };
}
