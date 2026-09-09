import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./googleAuth.ts", import.meta.url), "utf8");

describe("personal Google Drive connection access", () => {
  it("does not block one Google user because another user has already connected a Drive", () => {
    expect(source).not.toContain("Google Drive backup is already connected by the project owner");
    expect(source).not.toContain("getGoogleDriveSnapshotConnection()");
  });

  it("continues to authenticate each connected Drive against the current Google user", () => {
    expect(source).toContain('if (user.loginMethod !== "google")');
    expect(source).toContain("saveGoogleDriveConnection({ userId: user.id");
  });
});
