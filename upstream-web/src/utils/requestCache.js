const cache = new Map();
const inFlight = new Map();

export const DEFAULT_CACHE_TTL = 30000;

/**
 * Read a cached value only when it is still fresh. The cache lives at module
 * scope so it survives component unmounts while the SPA changes workspaces.
 */
export const readCached = (key, ttl = DEFAULT_CACHE_TTL) => {
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.fetchedAt >= ttl) return undefined;
  return entry.value;
};

export const readCachedEntry = (key) => cache.get(key);

/**
 * Fetch once per key and de-duplicate concurrent callers. A forced request
 * still shares an existing in-flight request, preventing duplicate clicks or
 * page transitions from creating parallel game-data requests.
 */
export const requestCached = async (
  key,
  fetcher,
  { ttl = DEFAULT_CACHE_TTL, force = false } = {},
) => {
  if (!force) {
    const fresh = readCached(key, ttl);
    if (fresh !== undefined) return fresh;
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = Promise.resolve()
    .then(fetcher)
    .then((value) => {
      cache.set(key, { fetchedAt: Date.now(), value });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
};

export const clearCached = (key) => {
  if (key) cache.delete(key);
  else cache.clear();
};
