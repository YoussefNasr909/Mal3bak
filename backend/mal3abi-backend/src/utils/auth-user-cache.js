import { resolveProcessLocalCacheTtlMs } from "./process-local-cache.js";

// This cache is process-local. In PM2/cluster-style runtimes it auto-disables
// unless ALLOW_MULTI_PROCESS_AUTH_CACHE=true is set intentionally.
const AUTH_USER_CACHE_TTL_MS = resolveProcessLocalCacheTtlMs("AUTH_USER_CACHE_TTL_MS", 30 * 1000);
const AUTH_USER_CACHE_MAX_ENTRIES = 1000;
const authUserCache = new Map();

function isAuthUserCacheEnabled() {
  return AUTH_USER_CACHE_TTL_MS > 0;
}

function pruneExpiredAuthUsers() {
  if (!isAuthUserCacheEnabled()) {
    authUserCache.clear();
    return;
  }

  const now = Date.now();

  for (const [key, cached] of authUserCache.entries()) {
    if (!cached || cached.expiry <= now) {
      authUserCache.delete(key);
    }
  }
}

export function getCachedAuthUser(userId) {
  if (!isAuthUserCacheEnabled()) return null;
  pruneExpiredAuthUsers();
  const key = String(userId);
  const cached = authUserCache.get(key);
  if (!cached) return null;
  if (cached.expiry <= Date.now()) {
    authUserCache.delete(key);
    return null;
  }
  return cached.user;
}

export function setCachedAuthUser(user) {
  if (!isAuthUserCacheEnabled()) return;
  pruneExpiredAuthUsers();
  while (authUserCache.size >= AUTH_USER_CACHE_MAX_ENTRIES) {
    const oldestKey = authUserCache.keys().next().value;
    if (!oldestKey) break;
    authUserCache.delete(oldestKey);
  }
  authUserCache.set(String(user.id), {
    user: { id: user.id, role: user.role },
    expiry: Date.now() + AUTH_USER_CACHE_TTL_MS,
  });
}

export function clearCachedAuthUser(userId = null) {
  if (userId) {
    authUserCache.delete(String(userId));
    return;
  }

  authUserCache.clear();
}
