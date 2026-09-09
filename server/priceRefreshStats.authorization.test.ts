import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const now = new Date();
const regularUser = { user: { id: 2, openId: "regular", name: "Regular", email: "regular@example.com", loginMethod: "google", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now }, req: {}, res: {} } as TrpcContext;

describe("price refresh statistics authorization", () => {
  it("allows only the configured administrator to query 24-hour statistics", async () => {
    const caller = appRouter.createCaller(regularUser);
    await expect(caller.adminPrices.priceRefreshStats24h()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.adminPrices.failedPriceRefreshRuns24h()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
