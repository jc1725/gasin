import { describe, expect, it } from "vitest";
import { buildGoogleDriveAuthorizationUrl, decryptGoogleDriveRefreshToken, encryptGoogleDriveRefreshToken, getGoogleDriveRedirectUri } from "./googleDrivePersonal";

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
});
