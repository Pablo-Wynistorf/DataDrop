import * as jose from "jose";
import jwt from "jsonwebtoken";

const OIDC_ISSUER = process.env.OIDC_ISSUER;
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-me";
const DEFAULT_MAX_FILE_SIZE_GB = 1;

let jwksCache = null;
let jwksCacheTime = 0;
const JWKS_CACHE_TTL = 3600000; // 1 hour

async function getJWKS() {
  const now = Date.now();
  if (jwksCache && now - jwksCacheTime < JWKS_CACHE_TTL) {
    return jwksCache;
  }
  
  jwksCache = jose.createRemoteJWKSet(new URL(`${OIDC_ISSUER}/.well-known/jwks.json`));
  jwksCacheTime = now;
  return jwksCache;
}

function parseRoles(roles) {
  const result = {
    canUploadCdn: false,
    canUploadFile: false,
    maxFileSizeBytes: DEFAULT_MAX_FILE_SIZE_GB * 1024 * 1024 * 1024
  };

  if (!Array.isArray(roles)) return result;

  for (const role of roles) {
    if (role === "cdnUser") {
      result.canUploadCdn = true;
    } else if (role === "fileUser") {
      result.canUploadFile = true;
    } else if (role.startsWith("fileSize_")) {
      const sizeGB = parseInt(role.replace("fileSize_", ""), 10);
      if (!isNaN(sizeGB) && sizeGB > 0) {
        result.maxFileSizeBytes = sizeGB * 1024 * 1024 * 1024;
      }
    }
  }

  return result;
}

export async function requireAuth(req, res, next) {
  // Check for CLI token in Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const cliToken = authHeader.substring(7);
    try {
      const payload = jwt.verify(cliToken, JWT_SECRET);
      
      if (payload.type !== "cli") {
        return res.status(401).json({ error: "Invalid token type" });
      }

      const permissions = parseRoles(payload.roles);
      req.user = {
        userId: payload.sub,
        email: payload.email,
        name: payload.name || payload.email,
        roles: payload.roles || [],
        ...permissions
      };
      return next();
    } catch (error) {
      console.error("CLI token verification failed:", error.message);
      return res.status(401).json({ error: "Invalid CLI token" });
    }
  }

  // Fall back to cookie-based session (browser)
  const token = req.cookies?.session;
  
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const JWKS = await getJWKS();
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: OIDC_ISSUER,
      audience: OIDC_CLIENT_ID,
    });

    const permissions = parseRoles(payload.roles);

    req.user = {
      userId: payload.sub,
      email: payload.email,
      name: payload.name || payload.email,
      roles: payload.roles || [],
      ...permissions
    };
    next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);
    return res.status(401).json({ error: "Invalid token" });
  }
}
