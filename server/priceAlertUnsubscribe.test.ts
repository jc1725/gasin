import { beforeEach, describe, expect, it } from "vitest";

describe("price alert unsubscribe token", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "price-alert-test-secret";
  });

  it("round-trips the exact favorite period identity", async () => {
    const { createPriceAlertUnsubscribeToken, parsePriceAlertUnsubscribeToken } = await import("./priceAlertUnsubscribe");
    const token = createPriceAlertUnsubscribeToken({ userId: 7, productId: 42, favoriteId: 91 });
    expect(parsePriceAlertUnsubscribeToken(token)).toEqual({ userId: 7, productId: 42, favoriteId: 91 });
  });

  it("rejects a tampered token so an old link cannot affect another product", async () => {
    const { createPriceAlertUnsubscribeToken, parsePriceAlertUnsubscribeToken } = await import("./priceAlertUnsubscribe");
    const token = createPriceAlertUnsubscribeToken({ userId: 7, productId: 42, favoriteId: 91 });
    expect(parsePriceAlertUnsubscribeToken(`${token}x`)).toBeNull();
  });
});
