import { describe, expect, it } from "vitest";
import { getGoogleDriveSnapshotConnection } from "./db";
import { syncProductSnapshotToDrive } from "./scheduledJobs";

const describeWhenPersonalDriveEnabled = process.env.GASYN_ENABLE_PERSONAL_GOOGLE_DRIVE_SYNC === "true" ? describe : describe.skip;

describeWhenPersonalDriveEnabled("personal Google Drive product snapshot", () => {
  it("creates or updates the connected account's product snapshot", async () => {
    const detail = await syncProductSnapshotToDrive();
    const connection = await getGoogleDriveSnapshotConnection();
    expect(detail).toContain("Google Drive 상품 스냅샷");
    expect(connection?.snapshotFileId).toBeTruthy();
  }, 30_000);
});
