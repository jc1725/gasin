import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const now = new Date();

function context(user: { email: string; loginMethod: string; role: "user" | "admin" }): TrpcContext {
  return {
    user: { id: 2, openId: user.email, name: "Member", email: user.email, loginMethod: user.loginMethod, role: user.role, isSuspended: false, suspendedAt: null, suspensionEndsAt: null, suspensionReason: null, createdAt: now, updatedAt: now, lastSignedIn: now },
    req: {},
    res: {},
  } as TrpcContext;
}

describe("member management authorization", () => {
  it("rejects a regular Google member and a Kakao member before member data is read", async () => {
    await expect(appRouter.createCaller(context({ email: "member@example.com", loginMethod: "google", role: "user" })).members.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context({ email: "kakao@example.com", loginMethod: "kakao", role: "user" })).members.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows a role-based administrator into management but reserves role changes for the designated owner", async () => {
    const caller = appRouter.createCaller(context({ email: "delegated-admin@example.com", loginMethod: "google", role: "admin" }));
    await expect(caller.members.setRole({ memberId: 3, role: "user" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.members.setSuspension({ memberId: 3, isSuspended: true, reason: "반복적인 서비스 방해", endsAt: new Date(Date.now() + 86_400_000).toISOString() })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
