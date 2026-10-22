import {
  createMemoryInflightStore,
  createStorageInflightStore,
  type InflightStore,
} from "@usewhisk/core";

/**
 * `localStorage` when the page can write to it. Private browsing in Safari
 * and server rendering cannot, and get a store that lasts until the page is
 * closed instead.
 */
export function createBrowserInflightStore(): InflightStore {
  const storage = writableLocalStorage();
  return storage
    ? createStorageInflightStore(storage)
    : createMemoryInflightStore();
}

function writableLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const probe = "whisk:probe";
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    // Safari's private mode throws on write; the memory store covers it.
    return null;
  }
}
