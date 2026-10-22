/**
 * Stands in for wagmi dependencies that are imported but never run in the
 * browser. Property access on `{}` returns undefined instead of throwing.
 */
export default {};
export const noop = () => {};
