import { describe, expect, it } from "vitest";
import { GoogleDriveTokenDecryptionError, buildGoogleDriveAuthorizationUrl, decryptGoogleDriveRefreshToken, encryptGoogleDriveRefreshToken, getGoogleDriveRedirectUri } from "./googleDrivePersonal";

describe("personal Google Drive OAuth", () => {
  it("uses an incremental offline drive.file authorization request", () => {
    const url = new URL(buildGoogleDriveAuthorizationUrl({ clientId: "client-id", redirectUri: "https://gasyn.example/api/integrations/google-drive/callback", state: "state", loginHint: "owner@example.com" }));
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(getGoogleDriveRedirectUri("https://gasyn.example")).toBe("https://gasyn.example/api/integrations/google-drive/callback");
  });

  it("encrypts refresh tokens without retaining plaintext", () => {
    const ciphertext = encryptGoogleDriveRefreshToken("refresh-token", "test-secret");
    expect(ciphertext).not.toContain("refresh-token");
    expect(decryptGoogleDriveRefreshToken(ciphertext, "test-secret")).toBe("refresh-token");
  });

  // 2026-09-19: JWT_SECRET이 바뀌면(마이그레이션 등) 예전 암호문은 영원히 복호화에
  // 실패한다. syncProductSnapshotToDrive가 이 영구 오류를 네트워크 오류 같은 일시적
  // 오류와 구분해서 연결을 끊을 수 있도록, 구분되는 에러 타입으로 던지는지 확인한다.
  it("throws a distinguishable error when the secret no longer matches the stored ciphertext", () => {
    const ciphertext = encryptGoogleDriveRefreshToken("refresh-token", "old-secret");
    expect(() => decryptGoogleDriveRefreshToken(ciphertext, "new-secret")).toThrow(GoogleDriveTokenDecryptionError);
  });

  it("throws a distinguishable error when the stored ciphertext format is invalid", () => {
    expect(() => decryptGoogleDriveRefreshToken("not-a-valid-ciphertext", "test-secret")).toThrow(GoogleDriveTokenDecryptionError);
  });
});
