import { describe, expect, it } from "vitest";
import { getGooglePublicBaseUrl, getGoogleRedirectUri } from "./googleAuth";
import { getGoogleDriveRedirectUri } from "./googleDrivePersonal";

describe("getGoogleRedirectUri", () => {
  it("uses the public forwarded origin instead of the internal runtime host", () => {
    const headers: Record<string, string> = {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "gasyntrack-g9qvfrnc.manus.space",
      host: "wx5tsygpjc-7vovonpava-ue.a.run.app",
    };
    const req = { protocol: "http", get: (name: string) => headers[name] };

    expect(getGoogleRedirectUri(req)).toBe("https://gasyntrack-g9qvfrnc.manus.space/api/auth/google/callback");
    expect(getGoogleDriveRedirectUri(getGooglePublicBaseUrl(req))).toBe("https://gasyntrack-g9qvfrnc.manus.space/api/integrations/google-drive/callback");
  });

  it("falls back to the request host for local development", () => {
    const req = { protocol: "http", get: (name: string) => (name === "host" ? "localhost:3000" : undefined) };

    expect(getGoogleRedirectUri(req)).toBe("http://localhost:3000/api/auth/google/callback");
  });
});
