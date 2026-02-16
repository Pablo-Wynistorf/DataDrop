import * as jose from "jose";
import jwt from "jsonwebtoken";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const OIDC_ISSUER = process.env.OIDC_ISSUER;
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID;
const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;
const SESSIONS_TABLE = process.env.SESSIONS_TABLE;
const DEFAULT_MAX_FILE_SIZE_GB = 1;

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);


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

let oidcConfigCache = null;
let oidcConfigCacheTime = 0;
const OIDC_CONFIG_CACHE_TTL = 3600000; // 1 hour

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

async function tryRefreshSession(sessionId, refreshToken) {
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
    if (!tokens.id_token) return null;

    await docClient.send(new PutCommand({
      TableName: SESSIONS_TABLE,
      Item: {
        id: `session_${sessionId}`,
        type: "session",
        idToken: tokens.id_token,
        refreshToken: tokens.refresh_token || refreshToken,
        ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
      }
    }));

    return tokens.id_token;
  } catch (error) {
    console.error("Token refresh failed:", error.message);
    return null;
  }
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

  const sessionId = req.cookies?.session;
  
  if (!sessionId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let sessionRecord;
  try {
    const result = await docClient.send(new GetCommand({
      TableName: SESSIONS_TABLE,
      Key: { id: `session_${sessionId}` }
    }));
    sessionRecord = result.Item;
  } catch (error) {
    console.error("Session lookup failed:", error.message);
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!sessionRecord || sessionRecord.type !== "session" || !sessionRecord.idToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let token = sessionRecord.idToken;

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
    if (error.code === "ERR_JWT_EXPIRED" && sessionRecord.refreshToken) {
      const newToken = await tryRefreshSession(sessionId, sessionRecord.refreshToken);
      if (newToken) {
        try {
          const JWKS = await getJWKS();
          const { payload } = await jose.jwtVerify(newToken, JWKS, {
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
