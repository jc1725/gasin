import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoupangRateLimitError } from "./coupangRateLimit";

const mocks = vi.hoisted(() => ({
  getSearchApiQuotaStatus: vi.fn(),
  getCoupangApiRateLimitStatus: vi.fn(),
  recordCoupangRateLimitEvent: vi.fn(),
  listPendingDeepLinkProducts: vi.fn(),
  saveDeepLinkForProduct: vi.fn(),
  createCoupangDeepLinks: vi.fn(),
}));

vi.mock("./db", () => ({
  getSearchApiQuotaStatus: mocks.getSearchApiQuotaStatus,
  getCoupangApiRateLimitStatus: mocks.getCoupangApiRateLimitStatus,
  recordCoupangRateLimitEvent: mocks.recordCoupangRateLimitEvent,
  listPendingDeepLinkProducts: mocks.listPendingDeepLinkProducts,
  saveDeepLinkForProduct: mocks.saveDeepLinkForProduct,
}));
vi.mock("./coupang", () => ({ createCoupangDeepLinks: mocks.createCoupangDeepLinks }));

import { generatePendingDeepLinks } from "./deepLinks";
import { buildDeepLinkUpdate } from "./trackingState";

describe("generatePendingDeepLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCoupangApiRateLimitStatus.mockResolvedValue({ allowed: true });
  });

  it("stores an API-generated deep link once for each pending option SKU", async () => {
    mocks.getSearchApiQuotaStatus.mockResolvedValue({ allowed: true });
    mocks.listPendingDeepLinkProducts.mockResolvedValue([{ id: 7, affiliateUrl: "https://www.coupang.com/vp/products/7" }]);
    mocks.createCoupangDeepLinks.mockResolvedValue([{ originUrl: "https://www.coupang.com/vp/products/7", shortenUrl: "https://link.coupang.com/a/ready" }]);

    const result = await generatePendingDeepLinks();

    expect(result).toMatchObject({ processedCount: 1 });
    expect(mocks.createCoupangDeepLinks).toHaveBeenCalledWith(["https://www.coupang.com/vp/products/7"]);
    expect(mocks.saveDeepLinkForProduct).toHaveBeenCalledWith(7, "https://link.coupang.com/a/ready", null);
  });

  it("isolates one url-convert 400 and continues converting the remaining direct URLs", async () => {
    mocks.getSearchApiQuotaStatus.mockResolvedValue({ allowed: true });
    const firstUrl = "https://www.coupang.com/vp/products/11";
    const secondUrl = "https://www.coupang.com/vp/products/12";
    mocks.listPendingDeepLinkProducts.mockResolvedValue([
      { id: 11, affiliateUrl: firstUrl },
      { id: 12, affiliateUrl: secondUrl },
    ]);
    mocks.createCoupangDeepLinks
      .mockRejectedValueOnce(new Error("Coupang API error 400: url convert failed"))
      .mockResolvedValueOnce([{ originUrl: secondUrl, shortenUrl: "https://link.coupang.com/a/second" }]);

    const result = await generatePendingDeepLinks();

    expect(result).toMatchObject({ processedCount: 1 });
    expect(mocks.createCoupangDeepLinks).toHaveBeenNthCalledWith(1, [firstUrl]);
    expect(mocks.createCoupangDeepLinks).toHaveBeenNthCalledWith(2, [secondUrl]);
    expect(mocks.saveDeepLinkForProduct).toHaveBeenCalledWith(11, null, expect.stringContaining("url convert failed"));
    expect(mocks.saveDeepLinkForProduct).toHaveBeenCalledWith(12, "https://link.coupang.com/a/second", null);
  });

  it("reuses an existing Coupang affiliate link without calling the deep-link API", async () => {
    mocks.getSearchApiQuotaStatus.mockResolvedValue({ allowed: true });
    const affiliateUrl = "https://link.coupang.com/re/AFFSDP?lptag=test&pageKey=7";
    mocks.listPendingDeepLinkProducts.mockResolvedValue([{ id: 9, affiliateUrl }]);

    const result = await generatePendingDeepLinks();

    expect(result).toMatchObject({ processedCount: 1 });
    expect(mocks.createCoupangDeepLinks).not.toHaveBeenCalled();
    expect(mocks.saveDeepLinkForProduct).toHaveBeenCalledWith(9, affiliateUrl);
  });

  it("isolates unsupported URLs without calling the deep-link API", async () => {
    mocks.getSearchApiQuotaStatus.mockResolvedValue({ allowed: true });
    mocks.listPendingDeepLinkProducts.mockResolvedValue([{ id: 10, affiliateUrl: "https://example.com/not-coupang" }]);

    const result = await generatePendingDeepLinks();

    expect(result).toMatchObject({ processedCount: 0 });
    expect(mocks.createCoupangDeepLinks).not.toHaveBeenCalled();
    expect(mocks.saveDeepLinkForProduct).toHaveBeenCalledWith(10, null, expect.stringContaining("원본 URL 문제"));
  });

  it("persists the generated URL as ready with an explicit update timestamp", () => {
    const timestamp = new Date("2026-08-14T08:00:00.000Z");
    expect(buildDeepLinkUpdate("https://link.coupang.com/a/ready", timestamp)).toEqual({
      deepLinkUrl: "https://link.coupang.com/a/ready",
      deepLinkStatus: "ready",
      deepLinkFailureReason: null,
      deepLinkUpdatedAt: timestamp,
    });
  });

  it("skips without creating a deep link while the global minute-rate protection is active", async () => {
    const retryAt = new Date("2026-08-15T17:07:00.000Z");
    mocks.getCoupangApiRateLimitStatus.mockResolvedValue({ allowed: false, retryAt, reason: "minute-limit" });

    await expect(generatePendingDeepLinks()).resolves.toMatchObject({ processedCount: 0, skipped: true, detail: expect.stringMatching(new RegExp(`minute-limit.*${retryAt.toISOString()}`)) });
    expect(mocks.createCoupangDeepLinks).not.toHaveBeenCalled();
    expect(mocks.recordCoupangRateLimitEvent).toHaveBeenCalledWith("deeplink", "minute-limit", retryAt);
  });

  it("turns an upstream minute-limit error into a retryable deep-link batch skip", async () => {
    const retryAt = new Date("2026-08-15T17:07:00.000Z");
    mocks.getSearchApiQuotaStatus.mockResolvedValue({ allowed: true });
    mocks.listPendingDeepLinkProducts.mockResolvedValue([{ id: 8, affiliateUrl: "https://www.coupang.com/vp/products/8" }]);
    mocks.createCoupangDeepLinks.mockRejectedValue(new CoupangRateLimitError(retryAt, "minute-limit"));

    await expect(generatePendingDeepLinks()).resolves.toMatchObject({ processedCount: 0, skipped: true, detail: expect.stringMatching(new RegExp(`minute-limit.*${retryAt.toISOString()}`)) });
    expect(mocks.recordCoupangRateLimitEvent).toHaveBeenCalledWith("deeplink", "minute-limit", retryAt);
  });
});
