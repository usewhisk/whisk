import clsx, { type ClassValue } from "clsx";

/** Wraps `clsx` so call sites do not depend on it directly. */
export function cn(...values: ClassValue[]): string {
  return clsx(values);
}
