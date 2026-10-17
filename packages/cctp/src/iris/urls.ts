/**
 * Iris API base URLs.
 */
import type { Network } from "../chains/types.js";

export const IRIS_MAINNET_URL = "https://iris-api.circle.com";
export const IRIS_SANDBOX_URL = "https://iris-api-sandbox.circle.com";

export function irisBaseUrl(network: Network): string {
  return network === "mainnet" ? IRIS_MAINNET_URL : IRIS_SANDBOX_URL;
}
