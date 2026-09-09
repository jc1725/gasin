import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const now = new Date();
const nonGoogleContext = { user: { id: 1, openId: "manual-user", name: "Manual", email: "manual@example.com", loginMethod: "email", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now }, req: {}, res: {} } as TrpcContext;

describe("web push authorization", () => {
  it("requires Google login before registering or viewing a device subscription", async () => {
    const caller = appRouter.createCaller(nonGoogleContext);
    await expect(caller.webPush.status()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.webPush.subscribe({ endpoint: "https://push.example/subscription", p256dh: "key", auth: "auth" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
