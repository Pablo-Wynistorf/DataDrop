import { Router } from "express";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import * as jose from "jose";
import { requireAuth } from "../middleware/auth.js";
import { upsertUserProfile } from "../lib/users.js";

const router = Router();
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const SESSIONS_TABLE = process.env.SESSIONS_TABLE;
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID;
const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET;
const OIDC_ISSUER = process.env.OIDC_ISSUER;
const REDIRECT_URI = process.env.REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL;
const JWT_SECRET = process.env.JWT_SECRET;

// Cache OIDC discovery document to avoid fetching on every request
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

function getCookieOptions() {
  const isProduction = FRONTEND_URL?.startsWith("https");
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: "/",
  };
}

router.get("/login", async (req, res) => {
  try {
    const config = await getOIDCConfig();
    const state = uuidv4();
    const nonce = uuidv4();

    // Store state temporarily for CSRF protection (short-lived)
    await docClient.send(new PutCommand({
      TableName: SESSIONS_TABLE,
      Item: { id: state, type: "auth_state", nonce, ttl: Math.floor(Date.now() / 1000) + 600 }
    }));

    const params = new URLSearchParams({
      client_id: OIDC_CLIENT_ID,
      response_type: "code",
      scope: "openid email profile offline_access",
      redirect_uri: REDIRECT_URI,
      state,
      nonce
    });

    res.redirect(`${config.authorization_endpoint}?${params}`);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).json({ error: "Missing code or state" });
    }

    const stateRecord = await docClient.send(new GetCommand({
      TableName: SESSIONS_TABLE,
      Key: { id: state }
    }));

    if (!stateRecord.Item || stateRecord.Item.type !== "auth_state") {
      return res.status(400).json({ error: "Invalid state" });
    }

    // Clean up the state record
    await docClient.send(new DeleteCommand({
      TableName: SESSIONS_TABLE,
      Key: { id: state }
    }));

    const config = await getOIDCConfig();
    const tokenRes = await fetch(config.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: OIDC_CLIENT_ID,
        client_secret: OIDC_CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI
      })
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      return res.status(400).json({ error: "Token exchange failed" });
    }

    res.cookie("access_token", tokens.access_token, getCookieOptions());

    if (tokens.id_token) {
      res.cookie("id_token", tokens.id_token, getCookieOptions());
    }

    if (tokens.refresh_token) {
      res.cookie("refresh_token", tokens.refresh_token, {
        ...getCookieOptions(),
        maxAge: 20 * 24 * 60 * 60 * 1000,
      });
    }

    // Persist the display name/email captured at login. This is the source of
    // truth for the name, so it survives later token refreshes that may no
    // longer include the profile/name claim.
    if (tokens.id_token) {
      try {
        const claims = jose.decodeJwt(tokens.id_token);
        await upsertUserProfile(claims.sub, {
          name: claims.name || claims.given_name || claims.preferred_username,
          email: claims.email,
        });
      } catch (profileError) {
        console.error("Failed to persist user profile:", profileError.message);
      }
    }

    res.redirect(FRONTEND_URL);
  } catch (error) {
    console.error("Callback error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/verify", requireAuth, async (req, res) => {
  // Return user info with permissions
  res.json({
    userId: req.user.userId,
    email: req.user.email,
    name: req.user.name,
    roles: req.user.roles,
    isAdmin: req.user.isAdmin,
    canUploadCdn: req.user.canUploadCdn,
    canUploadFile: req.user.canUploadFile,
    maxFileSizeBytes: req.user.maxFileSizeBytes
  });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("id_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/" });
  res.json({ success: true });
});

router.post("/refresh", async (req, res) => {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) {
    return res.status(401).json({ error: "No refresh token" });
  }

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
    if (!tokens.access_token) {
      res.clearCookie("access_token", { path: "/" });
      res.clearCookie("refresh_token", { path: "/" });
      return res.status(401).json({ error: "Refresh failed, please login again" });
    }

    res.cookie("access_token", tokens.access_token, getCookieOptions());

    if (tokens.id_token) {
      res.cookie("id_token", tokens.id_token, getCookieOptions());
    }

    if (tokens.refresh_token) {
      res.cookie("refresh_token", tokens.refresh_token, {
        ...getCookieOptions(),
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Refresh error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ============ CLI Authentication ============

router.post("/cli/login", async (req, res) => {
  try {
    const cliCode = uuidv4();
    const displayCode = cliCode.substring(0, 8).toUpperCase();
    
    await docClient.send(new PutCommand({
      TableName: SESSIONS_TABLE,
      Item: {
        id: `cli_${cliCode}`,
        type: "cli_auth",
        status: "pending",
        displayCode,
        ttl: Math.floor(Date.now() / 1000) + 600
      }
    }));

    const authUrl = `${FRONTEND_URL}?cli_auth=${cliCode}`;
    
    res.json({
      code: cliCode,
      displayCode,
      authUrl,
      expiresIn: 600
    });
  } catch (error) {
    console.error("CLI login init error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/cli/login/:code", async (req, res) => {
  try {
    const { code } = req.params;
    
    const record = await docClient.send(new GetCommand({
      TableName: SESSIONS_TABLE,
      Key: { id: `cli_${code}` }
    }));

    if (!record.Item || record.Item.type !== "cli_auth") {
      return res.status(404).json({ error: "Invalid or expired code" });
    }

    if (record.Item.status === "pending") {
      return res.json({ status: "pending" });
    }

    if (record.Item.status === "authorized") {
      await docClient.send(new DeleteCommand({
        TableName: SESSIONS_TABLE,
        Key: { id: `cli_${code}` }
      }));

      return res.json({
        status: "authorized",
        token: record.Item.cliToken,
        expiresAt: record.Item.tokenExpiresAt,
        user: {
          userId: record.Item.userId,
          email: record.Item.email,
          name: record.Item.name
        }
      });
    }

    res.status(400).json({ error: "Unknown status" });
  } catch (error) {
    console.error("CLI login poll error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


router.post("/cli/authorize", requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: "Missing code" });
    }

    const record = await docClient.send(new GetCommand({
      TableName: SESSIONS_TABLE,
      Key: { id: `cli_${code}` }
    }));

    if (!record.Item || record.Item.type !== "cli_auth" || record.Item.status !== "pending") {
      return res.status(404).json({ error: "Invalid or expired code" });
    }

    const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const cliToken = jwt.sign(
      {
        sub: req.user.userId,
        email: req.user.email,
        name: req.user.name,
        roles: req.user.roles,
        type: "cli"
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    await docClient.send(new PutCommand({
      TableName: SESSIONS_TABLE,
      Item: {
        id: `cli_${code}`,
        type: "cli_auth",
        status: "authorized",
        cliToken,
        tokenExpiresAt: tokenExpiresAt.toISOString(),
        userId: req.user.userId,
        email: req.user.email,
        name: req.user.name,
        ttl: Math.floor(Date.now() / 1000) + 120
      }
    }));

    res.json({ 
      success: true,
      message: "CLI authorized successfully"
    });
  } catch (error) {
    console.error("CLI authorize error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
