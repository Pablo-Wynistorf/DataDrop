import * as jose from "jose";
import jwt from "jsonwebtoken";
import { getOrCreateUser, getEffectivePermissions } from "../lib/users.js";

const OIDC_ISSUER = process.env.OIDC_ISSUER;
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID;
const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL;
const JWT_SECRET = process.env.JWT_SECRET;

// The only role we consume from the OIDC provider. Everything else (upload
// permissions, size limits) is managed inside the app via the users table.
const ADMIN_ROLE = "admin";

let jwksCache = null;
let jwksCacheTime = 0;
const JWKS_CACHE_TTL = 3600000;

async function getJWKS() {
  const now = Date.now();
  if (jwksCache && now - jwksCacheTime < JWKS_CACHE_TTL) {
    return jwksCache;
  }
  const jwksUrl = `${OIDC_ISSUER}/.well-known/jwks.json`;
  const response = await fetch(jwksUrl);
  const jwksData = await response.json();
  jwksCache = jose.createLocalJWKSet(jwksData);
  jwksCacheTime = now;
  return jwksCache;
}

// Cache OIDC discovery document
let oidcConfigCache = null;
let oidcConfigCacheTime = 0;
const OIDC_CONFIG_CACHE_TTL = 3600000;

async function getOIDCConfig() {
  const now = Date.now();
  if (oidcConfigCache && now - oidcConfigCacheTime < OIDC_CONFIG_CACHE_TTL) {
    return oidcConfigCache;
  }
  const res = await fetch(`${OIDC_ISSUER}/.well-known/openid-configuration`);
  oidcConfigCache = await res.json();
  oidcConfigCacheTime = now;
  return oidcConfigCache;
}

function getCookieOptions() {
  const isProduction = FRONTEND_URL?.startsWith("https");
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    path: "/",
  };
}

function isAdminRole(roles) {
  return Array.isArray(roles) && roles.includes(ADMIN_ROLE);
}

async function tryRefresh(refreshToken) {
  try {
    const config = await getOIDCConfig();
    const tokenRes = await fetch(config.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: OIDC_CLIENT_ID,
        client_secret: OIDC_CLIENT_SECRET,
        refresh_token: refreshToken
      })
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return null;
    return tokens;
  } catch (error) {
    console.error("Token refresh failed:", error.message);
    return null;
  }
}

// Decode the id_token to extract user claims (roles, email, etc.)
// The id_token is already from the same trusted IDP, so we just decode it here.
// Auth is validated via the access_token.
function decodeIdToken(idToken) {
  try {
    return jose.decodeJwt(idToken);
  } catch {
    return null;
  }
}

async function buildUser(accessPayload, idPayload) {
  // Prefer id_token claims for user info and roles, fall back to access_token
  const claims = idPayload || accessPayload;
  const roles = claims.roles || accessPayload.roles || [];
  const userId = accessPayload.sub;

  // Permissions and the display name live in the users table so they persist
  // across token refreshes (a refreshed id_token may drop the profile/name
  // claim, which previously made the name fall back to the raw user id).
  const claimName = claims.name || claims.given_name || claims.preferred_username;
  const claimEmail = claims.email || accessPayload.email;
  const record = await getOrCreateUser(userId, { name: claimName, email: claimEmail });
  const permissions = getEffectivePermissions(record);

  return {
    userId,
    email: record.email || claimEmail,
    name: record.name || claimName || claimEmail || userId,
    roles,
    isAdmin: isAdminRole(roles),
    ...permissions
  };
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const cliToken = authHeader.substring(7);
    try {
      const payload = jwt.verify(cliToken, JWT_SECRET);

      if (payload.type !== "cli") {
        return res.status(401).json({ error: "Invalid token type" });
      }

      const roles = payload.roles || [];
      const record = await getOrCreateUser(payload.sub, { name: payload.name, email: payload.email });
      const permissions = getEffectivePermissions(record);
      req.user = {
        userId: payload.sub,
        email: record.email || payload.email,
        name: record.name || payload.name || payload.email,
        roles,
        isAdmin: isAdminRole(roles),
        ...permissions
      };
      return next();
    } catch (error) {
      console.error("CLI token verification failed:", error.message);
      return res.status(401).json({ error: "Invalid CLI token" });
    }
  }

  const accessToken = req.cookies?.access_token;

  if (!accessToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const JWKS = await getJWKS();
    const { payload } = await jose.jwtVerify(accessToken, JWKS, {
      issuer: OIDC_ISSUER,
    });

    const idClaims = req.cookies?.id_token ? decodeIdToken(req.cookies.id_token) : null;
    req.user = await buildUser(payload, idClaims);
    next();
  } catch (error) {
    if (error.code === "ERR_JWT_EXPIRED" && req.cookies?.refresh_token) {
      const tokens = await tryRefresh(req.cookies.refresh_token);
      if (tokens) {
        try {
          const JWKS = await getJWKS();
          const { payload } = await jose.jwtVerify(tokens.access_token, JWKS, {
            issuer: OIDC_ISSUER,
          });

          res.cookie("access_token", tokens.access_token, {
            ...getCookieOptions(),
            maxAge: 24 * 60 * 60 * 1000,
          });
          if (tokens.id_token) {
            res.cookie("id_token", tokens.id_token, getCookieOptions());
          }
          if (tokens.refresh_token) {
            res.cookie("refresh_token", tokens.refresh_token, {
              ...getCookieOptions(),
              maxAge: 30 * 24 * 60 * 60 * 1000,
            });
          }

          const idClaims = tokens.id_token ? decodeIdToken(tokens.id_token) : null;
          req.user = await buildUser(payload, idClaims);
          return next();
        } catch (refreshError) {
          console.error("Refreshed token verification failed:", refreshError.message);
        }
      }
    }

    console.error("JWT verification failed:", error.message);
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Gate admin-only endpoints. Must run after requireAuth so req.user is set.
// Admin access is granted solely by the "admin" role coming from the OIDC
// provider - it is the one role DataDrop still reads from OneIDP.
export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
