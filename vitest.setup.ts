// 2026-09-29: 테스트 실행 시 .env를 전혀 읽지 않아, 토큰·시크릿이 필요한 테스트 15건이
// 항상 401·503으로 실패했다(로컬 .env가 비어 있어도 마찬가지). 이 파일은
//   1) .env가 있으면 그 값을 먼저 읽고,
//   2) 비어 있는 키만 "테스트 전용 더미 값"으로 채운다.
// 실제 운영 값이 .env에 있으면 그대로 우선하므로, 운영 비밀값을 저장소에 넣을 필요가 없다.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import dotenv from "dotenv";
import webpush from "web-push";

const envPath = resolve(import.meta.dirname, ".env");
if (existsSync(envPath)) dotenv.config({ path: envPath });

/** 실제 값이 없을 때만 테스트용 값을 채운다. 채웠으면 true(= 운영 자격증명 아님). */
function fillWhenMissing(key: string, value: string) {
  if (process.env[key]?.trim()) return false;
  process.env[key] = value;
  return true;
}

fillWhenMissing("APP_BASE_URL", "https://gasin.shop");
fillWhenMissing("GASYN_COLLECT_TOKEN", `test-collect-${randomBytes(8).toString("hex")}`);
fillWhenMissing("GASYN_EXTERNAL_SCHEDULE_TOKEN", `test-schedule-${randomBytes(8).toString("hex")}`);
fillWhenMissing("JWT_SECRET", randomBytes(32).toString("hex"));
// 2026-10-01: 세션 토큰에는 appId(VITE_APP_ID)가 함께 서명되고, verifySession은 이 값이
// 비어 있으면 토큰을 거부한다("[Auth] Session payload missing required fields"). 이 값이
// 없으면 로그인 세션이 필요한 테스트가 전부 "비로그인"으로 떨어진다(정지 회원 안내 등).
fillWhenMissing("VITE_APP_ID", "gasyn-test-app");

// 카카오·Gmail은 실제 서버에 접속해 자격증명을 검증하는 테스트가 따로 있다. 더미 값을
// 채웠다는 사실을 표시해 두면 그 테스트들이 스스로 건너뛴다(아래 test.ts들 참고).
const kakaoIsDummy = [
  fillWhenMissing("KAKAO_REST_API_KEY", "test-kakao-rest-api-key"),
  fillWhenMissing("KAKAO_CLIENT_SECRET", "test-kakao-client-secret"),
].some(Boolean);
if (kakaoIsDummy) process.env.GASYN_TEST_DUMMY_KAKAO = "1";

// 웹푸시는 형식이 유효한 VAPID 키쌍이어야 라우트가 200을 준다. 없으면 이 실행에서만
// 쓰는 키쌍을 새로 만든다(운영 키를 저장소에 두지 않기 위함).
if (!process.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || !process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim()) {
  const generated = webpush.generateVAPIDKeys();
  process.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY = generated.publicKey;
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = generated.privateKey;
}
fillWhenMissing("WEB_PUSH_VAPID_SUBJECT", "mailto:test@gasin.shop");
