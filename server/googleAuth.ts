import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "./db";
import { buildGoogleDriveAuthorizationUrl, encryptGoogleDriveRefreshToken, exchangeGoogleDriveAuthorizationCode, getGoogleDriveRedirectUri } from "./googleDrivePersonal";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";

const GOOGLE_STATE_COOKIE = "gasyn_google_oauth_state";
const GOOGLE_DRIVE_STATE_COOKIE = "gasyn_google_drive_oauth_state";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USER_INFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured");
  return { clientId, clientSecret };
}

export function getGooglePublicBaseUrl(req: Pick<Request, "get" | "protocol">) {
  const protocol = req.get("x-forwarded-proto")?.split(",")[0] || req.protocol;
  const host = req.get("x-forwarded-host")?.split(",")[0] || req.get("host");
  return `${protocol}://${host}`;
}

export function getGoogleRedirectUri(req: Pick<Request, "get" | "protocol">) {
  return `${getGooglePublicBaseUrl(req)}/api/auth/google/callback`;
}

function getQueryString(req: Request, key: string) {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

type GoogleTokenPayload = { access_token: string };
type GoogleProfile = { sub: string; email?: string; email_verified?: boolean; name?: string };

export function registerGoogleOAuthRoutes(app: Express) {
  app.get("/api/auth/google", (req, res) => {
    try {
      const { clientId } = getGoogleConfig();
      const state = crypto.randomBytes(32).toString("hex");
      res.cookie(GOOGLE_STATE_COOKIE, state, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60 * 1000,
      });
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: getGoogleRedirectUri(req),
        response_type: "code",
        scope: "openid email profile",
        state,
        prompt: "select_account",
      });
      res.redirect(302, `${GOOGLE_AUTH_URL}?${params.toString()}`);
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : "Google login unavailable" });
    }
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const code = getQueryString(req, "code");
    const state = getQueryString(req, "state");
    const expectedState = parseCookieHeader(req.headers.cookie ?? "")[GOOGLE_STATE_COOKIE];
    res.clearCookie(GOOGLE_STATE_COOKIE, { path: "/", secure: true, sameSite: "lax" });

    if (
      !code ||
      !state ||
      !expectedState ||
      state.length !== expectedState.length ||
      !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))
    ) {
      res.redirect(302, "/?login=failed");
      return;
    }

    try {
      const { clientId, clientSecret } = getGoogleConfig();
      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: getGoogleRedirectUri(req),
          grant_type: "authorization_code",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const tokens = (await tokenResponse.json()) as GoogleTokenPayload;
      if (!tokenResponse.ok || !tokens.access_token) throw new Error("Google token exchange failed");

      const profileResponse = await fetch(GOOGLE_USER_INFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const profile = (await profileResponse.json()) as GoogleProfile;
      if (!profileResponse.ok || !profile.sub || !profile.email || !profile.email_verified) {
        throw new Error("Google account email verification is required");
      }

      const openId = `google:${profile.sub}`;
      await db.upsertUser({
        openId,
        name: profile.name ?? profile.email,
        email: profile.email,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });
      const sessionToken = await sdk.createSessionToken(openId, {
        name: profile.name ?? profile.email,
        expiresInMs: ONE_YEAR_MS,
      });
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[Google OAuth] callback failed", error);
      res.redirect(302, "/?login=failed");
    }
  });

  app.get("/api/integrations/google-drive/connect", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.loginMethod !== "google") {
        res.status(403).json({ error: "Google login is required" });
        return;
      }
      const { clientId } = getGoogleConfig();
      const state = crypto.randomBytes(32).toString("hex");
      res.cookie(GOOGLE_DRIVE_STATE_COOKIE, state, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60 * 1000,
      });
      const redirectUri = getGoogleDriveRedirectUri(getGooglePublicBaseUrl(req));
      res.redirect(302, buildGoogleDriveAuthorizationUrl({ clientId, redirectUri, state, loginHint: user.email }));
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : "Google Drive connection is unavailable" });
    }
  });

  app.get("/api/integrations/google-drive/callback", async (req: Request, res: Response) => {
    const code = getQueryString(req, "code");
    const state = getQueryString(req, "state");
    const expectedState = parseCookieHeader(req.headers.cookie ?? "")[GOOGLE_DRIVE_STATE_COOKIE];
    res.clearCookie(GOOGLE_DRIVE_STATE_COOKIE, { path: "/", secure: true, sameSite: "lax" });
    if (!code || !state || !expectedState || state.length !== expectedState.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))) {
      res.redirect(302, "/favorites?drive=failed");
      return;
    }
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.loginMethod !== "google") throw new Error("Google login is required");
      const refreshToken = await exchangeGoogleDriveAuthorizationCode(code, getGoogleDriveRedirectUri(getGooglePublicBaseUrl(req)));
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || "root";
      await db.saveGoogleDriveConnection({ userId: user.id, refreshTokenCiphertext: encryptGoogleDriveRefreshToken(refreshToken), folderId });
      res.redirect(302, "/favorites?drive=connected");
    } catch (error) {
      console.error("[Google Drive OAuth] callback failed", error);
      res.redirect(302, "/favorites?drive=failed");
    }
  });
}
