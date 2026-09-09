import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const now = new Date();
const regularUser = { user: { id: 2, openId: "regular", name: "Regular", email: "regular@example.com", loginMethod: "google", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now }, req: {}, res: {} } as TrpcContext;

describe("collector sync authorization", () => {
  it("allows only the administrator to read or run collector synchronization", async () => {
    const caller = appRouter.createCaller(regularUser);
    await expect(caller.adminPrices.collectorSyncStatus()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.adminPrices.syncCollectedPrices()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.adminPrices.enqueueAllSearchProductsForPriceRefresh()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
