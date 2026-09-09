import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createNonGoogleUserContext(): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 1,
      openId: "manual-user",
      name: "Manual User",
      email: "manual@example.com",
      loginMethod: "manus",
      role: "user",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("favorites authorization", () => {
  it("requires a Google-authenticated account before listing favorite products", async () => {
    const caller = appRouter.createCaller(createNonGoogleUserContext());
    await expect(caller.favorites.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "찜한상품은 Google 로그인 후 이용할 수 있습니다.",
    });
  });

  it("requires a Google-authenticated account before reading or changing target prices", async () => {
    const caller = appRouter.createCaller(createNonGoogleUserContext());
    await expect(caller.favorites.listTargetPrices()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.favorites.setTargetPrice({ productId: 1, targetPrice: 10_000 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
