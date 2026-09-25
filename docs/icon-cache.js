// Caches only the resolved icon URL per item id, not the image bytes: the icon host sends no Access-Control-Allow-Origin header, so fetch() cannot read them, while an <img> load is not governed by CORS. The HTTP cache (360-day max-age) covers the bytes; this cache lets an icon paint before the reference-data shard that resolves it has loaded.

// Bump when the stored value shape changes or stored URLs stop being trusted; other versions' entries are removed on first use.
const SCHEMA_VERSION = 2;
const NS = `furcat-iconcache-v${SCHEMA_VERSION}-`;

const MAX_ENTRIES = 4000;
// Batch eviction is cheaper than evicting on every write.
const EVICT_BATCH = 400;

// Most recently used last. Rebuilt from localStorage on first use, so exact recency does not survive a reload; only the cap is guaranteed.
let lruInited = false;
const lru = [];                  // oldest first
const lruSet = new Set();        // membership mirror of `lru`

function key(id) { return NS + id; }

function initLRU() {
  if (lruInited) return;
  lruInited = true;
  try {
    // Older versions' entries are never read, so they only take quota.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("furcat-iconcache-v") && !k.startsWith(NS)) localStorage.removeItem(k);
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS)) {
        const id = Number(k.slice(NS.length));
        if (Number.isInteger(id) && !lruSet.has(id)) {
          lru.push(id);
          lruSet.add(id);
        }
      }
    }
  } catch (_) {
    // localStorage unavailable: the cache no-ops.
  }
}

function touch(id) {
  if (lruSet.has(id)) {
    const i = lru.indexOf(id);
    if (i >= 0) lru.splice(i, 1);
  } else {
    lruSet.add(id);
  }
  lru.push(id);
}

function evictIfNeeded() {
  if (lru.length <= MAX_ENTRIES) return;
  const drop = Math.min(EVICT_BATCH, lru.length - MAX_ENTRIES + EVICT_BATCH);
  const victims = lru.splice(0, drop);
  for (const id of victims) {
    lruSet.delete(id);
    try { localStorage.removeItem(key(id)); } catch (_) { /* non-fatal */ }
  }
}

export function getCachedIconURL(id) {
  if (!Number.isInteger(id)) return null;
  initLRU();
  try {
    const v = localStorage.getItem(key(id));
    if (v == null) return null;
    touch(id);
    return v;
  } catch (_) {
    return null;
  }
}

export function putCachedIconURL(id, url) {
  if (!Number.isInteger(id) || typeof url !== "string" || !url) return;
  initLRU();
  try {
    localStorage.setItem(key(id), url);
    touch(id);
    evictIfNeeded();
  } catch (_) {
    // Quota, private mode or file://: drop the oldest batch and retry once.
    try {
      evictIfNeeded();
      const drop = lru.splice(0, EVICT_BATCH);
      for (const old of drop) {
        lruSet.delete(old);
        localStorage.removeItem(key(old));
      }
      localStorage.setItem(key(id), url);
      touch(id);
    } catch (_) { /* non-fatal */ }
  }
}

// For a retry after the image failed to load.
export function dropCachedIconURL(id) {
  if (!Number.isInteger(id)) return;
  initLRU();
  try { localStorage.removeItem(key(id)); } catch (_) { /* non-fatal */ }
  const i = lru.indexOf(id);
  if (i !== -1) lru.splice(i, 1);
  lruSet.delete(id);
}

export function clearIconCache() {
  initLRU();
  try {
    for (const id of lru.slice()) localStorage.removeItem(key(id));
  } catch (_) { /* non-fatal */ }
  lru.length = 0;
  lruSet.clear();
}

export function iconCacheSize() {
  initLRU();
  return lru.length;
}
