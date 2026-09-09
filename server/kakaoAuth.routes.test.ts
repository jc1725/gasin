import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getKakaoRedirectUri, registerKakaoOAuthRoutes } from "./kakaoAuth";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  registerKakaoOAuthRoutes(app);
  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      const address = server.address();
      if (address && typeof address !== "string") baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (!server) return;
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe("Kakao OAuth routes", () => {
  it("creates a CSRF state cookie and redirects to Kakao with the fixed production callback", async () => {
    const response = await fetch(`${baseUrl}/api/auth/kakao`, { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("set-cookie")).toContain("gasyn_kakao_oauth_state=");

    const authorizationUrl = new URL(response.headers.get("location")!);
    expect(authorizationUrl.origin).toBe("https://kauth.kakao.com");
    expect(authorizationUrl.pathname).toBe("/oauth/authorize");
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(getKakaoRedirectUri());
    expect(authorizationUrl.searchParams.get("state")).toMatch(/^[a-f0-9]{64}\.[A-Za-z0-9_-]+$/);
  });

  it("rejects a callback that has no matching CSRF state before any token request", async () => {
    const response = await fetch(`${baseUrl}/api/auth/kakao/callback?code=unused&state=wrong`, { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/?login=failed");
  });
});
