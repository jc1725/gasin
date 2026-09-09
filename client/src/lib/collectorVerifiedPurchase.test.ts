import { describe, expect, it } from "vitest";
import { hasCollectorVerifiedPurchasePath } from "./collectorVerifiedPurchase";

const now = new Date("2026-08-27T04:00:00.000Z");
const observedAt = new Date("2026-08-27T03:00:00.000Z");

describe("hasCollectorVerifiedPurchasePath", () => {
  it("allows only a recent in-stock exact SKU Coupang product URL", () => {
    expect(hasCollectorVerifiedPurchasePath({ externalProductId: "7675142851:28917582269:95849306686", affiliateUrl: "https://www.coupang.com/vp/products/7675142851?itemId=28917582269&vendorItemId=95849306686", inStock: true, wowMemberPrice: 17880, wowMemberPriceObservedAt: observedAt }, now)).toBe(true);
  });

  it("rejects a changed option or a stale collector observation", () => {
    expect(hasCollectorVerifiedPurchasePath({ externalProductId: "7675142851:28917582269:95849306686", affiliateUrl: "https://www.coupang.com/vp/products/7675142851?itemId=28917582269&vendorItemId=1", inStock: true, wowMemberPrice: 17880, wowMemberPriceObservedAt: observedAt }, now)).toBe(false);
    expect(hasCollectorVerifiedPurchasePath({ externalProductId: "7675142851:28917582269:95849306686", affiliateUrl: "https://www.coupang.com/vp/products/7675142851?itemId=28917582269&vendorItemId=95849306686", inStock: true, wowMemberPrice: 17880, wowMemberPriceObservedAt: new Date("2026-08-19T03:00:00.000Z") }, now)).toBe(false);
  });
});
