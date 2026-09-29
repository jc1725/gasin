import { describe, expect, it } from "vitest";

const redirectUri = "https://gasyntrack-g9qvfrnc.manus.space/api/auth/kakao/callback";

// 카카오 인증 서버에 실제 REST API 키로 요청해 보는 통합 테스트다. vitest.setup.ts가
// 더미 키를 채운 환경(.env에 실제 키 없음)에서는 건너뛴다.
const hasKakaoCredentials = process.env.GASYN_TEST_DUMMY_KAKAO !== "1";

describe.skipIf(!hasKakaoCredentials)("Kakao OAuth credentials", () => {
  it("accepts the configured REST API key at Kakao's authorization endpoint", async () => {
    const restApiKey = process.env.KAKAO_REST_API_KEY?.trim();
    const clientSecret = process.env.KAKAO_CLIENT_SECRET?.trim();

    expect(restApiKey).toBeTruthy();
    expect(clientSecret).toBeTruthy();

    const authorizeUrl = new URL("https://kauth.kakao.com/oauth/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", restApiKey!);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", "gasyn-credential-check");

    const response = await fetch(authorizeUrl, { redirect: "manual" });
    expect([200, 302]).toContain(response.status);
    expect(response.url).not.toContain("KOE101");
  }, 15_000);
});
