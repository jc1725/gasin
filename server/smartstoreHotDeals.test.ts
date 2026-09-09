import { describe, expect, it } from "vitest";
import { normalizeSmartstorePurchaseUrl } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const now = new Date();
const regularUser = { user: { id: 2, openId: "regular", name: "Regular", email: "regular@example.com", loginMethod: "google", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now }, req: {}, res: {} } as TrpcContext;
const adminUser = { user: { id: 1, openId: "admin", name: "Admin", email: "jc1725@gmail.com", loginMethod: "google", role: "admin", createdAt: now, updatedAt: now, lastSignedIn: now }, req: {}, res: {} } as TrpcContext;

describe("smartstore hot-deal purchase link safety", () => {
  it("accepts only HTTPS smartstore product links", () => {
    expect(normalizeSmartstorePurchaseUrl("https://smartstore.naver.com/gasin/products/123")).toContain("smartstore.naver.com/gasin/products/123");
    expect(normalizeSmartstorePurchaseUrl("https://seller.smartstore.naver.com/products/123")).toContain("seller.smartstore.naver.com/products/123");
    expect(() => normalizeSmartstorePurchaseUrl("http://smartstore.naver.com/gasin/products/123")).toThrow("HTTPS");
    expect(() => normalizeSmartstorePurchaseUrl("https://example.com/products/123")).toThrow("스마트스토어");
  });
});

describe("smartstore hot-deal admin contract", () => {
  const validData = {
    title: "핫딜 테스트 상품",
    storeName: "스마트스토어",
    description: null,
    imageUrl: null,
    purchaseUrl: "https://smartstore.naver.com/gasin/products/123",
    regularPrice: 20_000,
    salePrice: 10_000,
    isActive: true,
    sortOrder: 0,
    startsAt: null,
    endsAt: null,
  };

  it("blocks non-admin users from the management endpoints", async () => {
    const caller = appRouter.createCaller(regularUser);
    await expect(caller.hotDeals.adminList()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.hotDeals.create(validData)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects sale prices above regular price and invalid sale periods before writing", async () => {
    const caller = appRouter.createCaller(adminUser);
    await expect(caller.hotDeals.create({ ...validData, regularPrice: 9_000 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.hotDeals.create({ ...validData, startsAt: "2026-08-26T00:00:00.000Z", endsAt: "2026-08-25T00:00:00.000Z" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
