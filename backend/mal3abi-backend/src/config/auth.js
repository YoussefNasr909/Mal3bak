export const ACCESS_TOKEN_COOKIE = process.env.ACCESS_TOKEN_COOKIE || "mal3abi_access_token";
export const REFRESH_TOKEN_COOKIE = process.env.REFRESH_TOKEN_COOKIE || "mal3abi_refresh_token";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function resolveSameSite() {
  const raw = String(process.env.AUTH_COOKIE_SAME_SITE || "").trim().toLowerCase();
  if (raw === "strict" || raw === "lax" || raw === "none") {
    return raw;
  }
  return "lax";
}

function baseCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  const sameSite = resolveSameSite();
  const secure = isProd;

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
  };
}

export function getAccessTokenCookieOptions({ remember = false } = {}) {
  const options = baseCookieOptions();
  if (remember) {
    options.maxAge = THIRTY_DAYS_MS;
  }
  return options;
}

export function getRefreshTokenCookieOptions({ remember = false } = {}) {
  const options = baseCookieOptions();
  if (remember) {
    options.maxAge = THIRTY_DAYS_MS;
  }
  return options;
}

// Backward-compatible alias used by some older files.
export function getAuthCookieOptions(opts = {}) {
  return getAccessTokenCookieOptions(opts);
}
