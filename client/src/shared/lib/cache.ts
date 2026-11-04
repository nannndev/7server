// In-memory cache for API reads, per browser tab. Pages render the last known data immediately and
// refresh it in the background (stale-while-revalidate), so moving between pages doesn't restart from a spinner.
// shortcut: no TTL or size cap; fine for a handful of servers, add LRU eviction if the key count grows large.
const store = new Map<string, unknown>();

export const cacheGet = <T,>(key: string) => store.get(key) as T | undefined;
export const cacheSet = (key: string, value: unknown) => {
  store.set(key, value);
};
export const cacheClear = () => store.clear();

/**
 * Applies the cached value synchronously (if any), then fetches fresh data and applies that.
 * setLoading only fires when there is nothing to show yet, or when `force` (an explicit Refresh click).
 * Errors propagate to the caller.
 */
export async function swr<T>(
  key: string,
  fetcher: () => Promise<T>,
  apply: (v: T) => void,
  setLoading?: (on: boolean) => void,
  force = false
): Promise<void> {
  const hit = force ? undefined : (store.get(key) as T | undefined);
  if (hit !== undefined) apply(hit);
  else setLoading?.(true);
  try {
    const fresh = await fetcher();
    store.set(key, fresh);
    apply(fresh);
  } finally {
    if (hit === undefined) setLoading?.(false);
  }
}
