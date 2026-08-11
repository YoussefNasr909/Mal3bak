function parseCacheTtlMs(rawValue, defaultTtlMs) {
  if (rawValue == null || String(rawValue).trim() === "") {
    return defaultTtlMs;
  }

  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return defaultTtlMs;
  }

  return parsed;
}

export function isMultiProcessRuntime() {
  return typeof process.env.NODE_APP_INSTANCE !== "undefined" || typeof process.env.pm_id !== "undefined";
}

export function resolveProcessLocalCacheTtlMs(envKey, defaultTtlMs) {
  const ttlMs = parseCacheTtlMs(process.env[envKey], defaultTtlMs);
  const allowMultiProcessCache = String(process.env.ALLOW_MULTI_PROCESS_AUTH_CACHE || "").toLowerCase() === "true";

  if (!allowMultiProcessCache && isMultiProcessRuntime()) {
    return 0;
  }

  return ttlMs;
}
