import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createNonAdminContext(): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 1,
      openId: "regular-user",
      name: "Regular User",
      email: "regular@example.com",
      loginMethod: "google",
      role: "user",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("product request administration authorization", () => {
  it("allows public submission but reserves request review and status changes for the administrator", async () => {
    const caller = appRouter.createCaller(createNonAdminContext());
    await expect(caller.productRequests.listForAdmin()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.productRequests.updateStatus({ requestId: 1, status: "reviewing" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
