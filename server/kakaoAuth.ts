import { parse as parseCookieHeader } from "cookie";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import * as db from "./db";

const KAKAO_STATE_COOKIE = "gasyn_kakao_oauth_state";
const KAKAO_RETURN_TO_COOKIE = "gasyn_kakao_return_to";
const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const KAKAO_USER_INFO_URL = "https://kapi.kakao.com/v2/user/me";

type KakaoTokenPayload = { access_token?: string };
type KakaoProfile = {
  id?: number | string;
  kakao_account?: {
    email?: string;
    profile?: { nickname?: string };
  };
};

function getKakaoConfig() {
  const restApiKey = ENV.kakaoRestApiKey;
  const clientSecret = ENV.kakaoClientSecret;
  if (!restApiKey || !clientSecret) throw new Error("Kakao OAuth is not configured");
  return { restApiKey, clientSecret };
}

export function getKakaoRedirectUri() {
  return `${ENV.appBaseUrl}/api/auth/kakao/callback`;
}

function getQueryString(req: Request, key: string) {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function normalizeReturnTo(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  try {
    const parsed = new URL(value, ENV.appBaseUrl);
    if (parsed.origin !== new URL(ENV.appBaseUrl).origin) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
  } catch {
    return "/";
  }
}

function encodeReturnToInState(nonce: string, returnTo: string) {
  return `${nonce}.${Buffer.from(returnTo, "utf8").toString("base64url")}`;
}

function decodeReturnToFromState(state: string | undefined) {
  if (!state) return "/";
  const separator = state.indexOf(".");
  if (separator < 1) return "/";
  try {
    return normalizeReturnTo(Buffer.from(state.slice(separator + 1), "base64url").toString("utf8"));
  } catch {
    return "/";
  }
}

function hasMatchingState(state: string | undefined, expectedState: string | undefined) {
  if (!state || !expectedState || state.length !== expectedState.length) return false;
  return timingSafeEqual(Buffer.from(state), Buffer.from(expectedState));
}

export function registerKakaoOAuthRoutes(app: Express) {
  app.get("/api/auth/kakao", (req, res) => {
    try {
      const { restApiKey } = getKakaoConfig();
      const returnTo = normalizeReturnTo(getQueryString(req, "returnTo"));
      const state = encodeReturnToInState(randomBytes(32).toString("hex"), returnTo);
      res.cookie(KAKAO_STATE_COOKIE, state, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60 * 1000,
      });
      res.cookie(KAKAO_RETURN_TO_COOKIE, returnTo, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60 * 1000,
      });
      const params = new URLSearchParams({
        client_id: restApiKey,
        redirect_uri: getKakaoRedirectUri(),
        response_type: "code",
        state,
      });
      res.redirect(302, `${KAKAO_AUTHORIZE_URL}?${params.toString()}`);
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : "Kakao login unavailable" });
    }
  });

  app.get("/api/auth/kakao/callback", async (req: Request, res: Response) => {
    const code = getQueryString(req, "code");
    const state = getQueryString(req, "state");
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const expectedState = cookies[KAKAO_STATE_COOKIE];
    const returnTo = decodeReturnToFromState(state) !== "/" ? decodeReturnToFromState(state) : normalizeReturnTo(cookies[KAKAO_RETURN_TO_COOKIE]);
    res.clearCookie(KAKAO_STATE_COOKIE, { path: "/", secure: true, sameSite: "lax" });
    res.clearCookie(KAKAO_RETURN_TO_COOKIE, { path: "/", secure: true, sameSite: "lax" });

    if (!code || !hasMatchingState(state, expectedState)) {
      res.redirect(302, `${returnTo}${returnTo.includes("?") ? "&" : "?"}login=failed`);
      return;
    }

    try {
      const { restApiKey, clientSecret } = getKakaoConfig();
      const tokenResponse = await fetch(KAKAO_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: restApiKey,
          client_secret: clientSecret,
          redirect_uri: getKakaoRedirectUri(),
          code,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const tokens = await tokenResponse.json() as KakaoTokenPayload;
      if (!tokenResponse.ok || !tokens.access_token) throw new Error("Kakao token exchange failed");

      const profileResponse = await fetch(KAKAO_USER_INFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const profile = await profileResponse.json() as KakaoProfile;
      if (!profileResponse.ok || profile.id === undefined || profile.id === null) throw new Error("Kakao user profile lookup failed");

      const name = profile.kakao_account?.profile?.nickname?.trim() || "카카오 사용자";
      const email = profile.kakao_account?.email?.trim() || null;
      const openId = `kakao:${String(profile.id)}`;
      await db.upsertUser({ openId, name, email, loginMethod: "kakao", lastSignedIn: new Date() });
      const sessionToken = await sdk.createSessionToken(openId, { name, expiresInMs: ONE_YEAR_MS });
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.redirect(302, returnTo);
    } catch (error) {
      console.error("[Kakao OAuth] callback failed", error);
      res.redirect(302, `${returnTo}${returnTo.includes("?") ? "&" : "?"}login=failed`);
    }
  });
}
