import { describe, expect, it } from "vitest";
import { buildGoogleDriveUrl, normalizeGoogleDrivePrivateKey, syncProductsToGoogleDrive, validateGoogleDriveConnection } from "./googleDrive";
import { listAllTrackedProducts } from "./db";

describe("normalizeGoogleDrivePrivateKey", () => {
  const pem = "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----";

  it("converts literal escaped line breaks to PEM lines", () => {
    expect(normalizeGoogleDrivePrivateKey(pem.replace(/\n/g, "\\n"))).toBe(pem);
  });

  it("accepts a quoted JSON string or full service-account JSON input", () => {
    expect(normalizeGoogleDrivePrivateKey(JSON.stringify(pem))).toBe(pem);
    expect(normalizeGoogleDrivePrivateKey(JSON.stringify({ client_email: "service@example.iam.gserviceaccount.com", private_key: pem }))).toBe(pem);
  });

  it("rejects values that are not complete PEM private keys", () => {
    expect(() => normalizeGoogleDrivePrivateKey("not-a-private-key")).toThrow("complete PEM private key");
  });
});

describe("Google Drive Shared Drive compatibility", () => {
  it("adds supportsAllDrives to upload requests", () => {
    const url = buildGoogleDriveUrl("https://www.googleapis.com/upload/drive/v3", "/files", { uploadType: "multipart" });
    expect(url).toContain("supportsAllDrives=true");
    expect(url).toContain("uploadType=multipart");
  });
});

const describeWhenDriveSyncEnabled = process.env.GASYN_ENABLE_GOOGLE_DRIVE_SYNC === "true" ? describe : describe.skip;

describeWhenDriveSyncEnabled("Google Drive service account", () => {
  it("authenticates and reads the configured product snapshot folder", async () => {
    await expect(validateGoogleDriveConnection()).resolves.toBe(true);
  }, 20_000);

  it("creates or updates the current product snapshot", async () => {
    const products = await listAllTrackedProducts();
    const result = await syncProductsToGoogleDrive(products);
    expect(result.fileId).toBeTruthy();
    expect(["created", "updated"]).toContain(result.action);
  }, 30_000);
});
