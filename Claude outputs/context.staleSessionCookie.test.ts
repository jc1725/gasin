import { describe, expect, it } from "vitest";
import { COOKIE_NAME } from "@shared/const";
import { createContext, type TrpcContext } from "./context";

// JWT_SECRET 교체(예: Manus → Railway 마이그레이션 시점) 이전에 발급된 세션 쿠키처럼,
// 서명 검증에 실패하는 낡은 쿠키는 그 자체로는 사라지지 않는다. 브라우저가 만료 전까지
// (최대 1년) 계속 같은 쿠키를 재전송하면서 매 요청마다 "[Auth] Session verification
// failed" 경고를 반복 유발한다. createContext는 이런 쿠키를 발견하면 한 번 지워서
// 이후 요청부터는 더 이상 보내지지 않도록 해야 한다.
type CookieCall = { name: string; options: Record<string, unknown> };

function createRequestLike(cookieHeader?: string) {
  return {
    protocol: "https",
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  } as unknown as TrpcContext["req"];
}

function createResponseLike() {
  const clearedCookies: CookieCall[] = [];
  const res = {
    clearCookie: (name: string, options: Record<string, unknown>) => {
      clearedCookies.push({ name, options });
    },
  } as unknown as TrpcContext["res"];
  return { res, clearedCookies };
}

describe("createContext stale session cookie handling", () => {
  it("clears an unverifiable session cookie so the browser stops resending it", async () => {
    const req = createRequestLike(`${COOKIE_NAME}=not-a-valid-jwt`);
    const { res, clearedCookies } = createResponseLike();

    const ctx = await createContext({ req, res } as any);

    expect(ctx.user).toBeNull();
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });

  it("does not touch cookies for an anonymous visitor with no session cookie at all", async () => {
    const req = createRequestLike(undefined);
    const { res, clearedCookies } = createResponseLike();

    const ctx = await createContext({ req, res } as any);

    expect(ctx.user).toBeNull();
    expect(clearedCookies).toHaveLength(0);
  });
});
