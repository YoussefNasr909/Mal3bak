import { ACCESS_TOKEN_COOKIE } from "../config/auth.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { parseCookieHeader } from "../utils/cookie.js";
import { getCachedAuthUser, setCachedAuthUser } from "../utils/auth-user-cache.js";
import { findAuthById } from "../repos/users.repo.js";

function getBearerToken(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== "string") return null;
  if (!authorizationHeader.startsWith("Bearer ")) return null;

  const token = authorizationHeader.slice("Bearer ".length).trim();
  return token || null;
}

export async function requireAuth(req, res, next) {
  try {
    const cookies = parseCookieHeader(req.headers.cookie);
    const cookieToken = cookies[ACCESS_TOKEN_COOKIE];
    const bearerToken = getBearerToken(req.headers.authorization);
    const token = bearerToken || cookieToken;

    if (!token) {
      return res.status(401).json({ message: "Unauthenticated" });
    }

    const payload = verifyAccessToken(token);
    if (!payload || payload.type !== "access" || !payload.sub) {
      return res.status(401).json({ message: "Unauthenticated" });
    }
    let authUser = getCachedAuthUser(payload.sub);
    if (!authUser) {
      authUser = await findAuthById(payload.sub);
      if (authUser) {
        setCachedAuthUser(authUser);
      }
    }

    if (!authUser) {
      return res.status(403).json({ message: "Account is inactive or deleted" });
    }

    req.user = { id: authUser.id, role: authUser.role };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthenticated" });
  }
}
