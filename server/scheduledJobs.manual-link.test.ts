import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNextWaitingManualLink: vi.fn(),
  activateManualTracksForKnownProducts: vi.fn(),
  setManualLinkWaitingError: vi.fn(),
  searchCatalogSafely: vi.fn(),
}));

vi.mock("./db", () => ({
  getNextWaitingManualLink: mocks.getNextWaitingManualLink,
  activateManualTracksForKnownProducts: mocks.activateManualTracksForKnownProducts,
  setManualLinkWaitingError: mocks.setManualLinkWaitingError,
}));
vi.mock("./catalogSearch", () => ({ searchCatalogSafely: mocks.searchCatalogSafely }));
vi.mock("./coupang", () => ({ COUPANG_BEST_CATEGORY_IDS: [], getBestCategoryProducts: vi.fn(), getCoupangVariantKey: vi.fn(), getGoldBoxProducts: vi.fn() }));
vi.mock("./deepLinks", () => ({ generatePendingDeepLinks: vi.fn() }));

import { processOneWaitingManualLink } from "./scheduledJobs";
import { buildManualLookupFailureUpdate, buildManualTrackUpdate } from "./trackingState";

describe("processOneWaitingManualLink", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records activation after a safe lookup resolves a waiting manual link", async () => {
    mocks.getNextWaitingManualLink.mockResolvedValue({ id: 31, externalProductId: "12345:1:2" });
    mocks.searchCatalogSafely.mockResolvedValue({ source: "database", products: [] });
    mocks.activateManualTracksForKnownProducts.mockResolvedValue(1);

    await expect(processOneWaitingManualLink()).resolves.toMatchObject({ summary: "수동 링크 1개 활성화" });
    expect(mocks.searchCatalogSafely).toHaveBeenCalledWith("12345", 10, { callType: "price-tracking" });
    expect(mocks.setManualLinkWaitingError).not.toHaveBeenCalled();
  });

  it("uses the stored product name and option instead of only a numeric page key for a waiting manual link", async () => {
    mocks.getNextWaitingManualLink.mockResolvedValue({ id: 34, externalProductId: "6539171735:21554142389:88606757411", queryKeyword: "피지오겔 베이비 로션", optionLabel: "400ml 2개" });
    mocks.searchCatalogSafely.mockResolvedValue({ source: "database", products: [] });
    mocks.activateManualTracksForKnownProducts.mockResolvedValue(0);

    await processOneWaitingManualLink();
    expect(mocks.searchCatalogSafely).toHaveBeenCalledWith("피지오겔 베이비 로션 400ml 2개", 10, { callType: "price-tracking" });
  });

  it("records a specific retry message when safe lookup remains rate-limited", async () => {
    const retryAt = new Date("2026-08-15T17:06:50.000Z");
    mocks.getNextWaitingManualLink.mockResolvedValue({ id: 32, externalProductId: "56789:1:2" });
    mocks.searchCatalogSafely.mockResolvedValue({ source: "rate_limited", products: [], retryAt });
    mocks.activateManualTracksForKnownProducts.mockResolvedValue(0);

    await expect(processOneWaitingManualLink()).resolves.toMatchObject({ summary: "수동 링크 재조회 보호 모드", detail: expect.stringContaining(retryAt.toISOString()) });
    expect(mocks.setManualLinkWaitingError).toHaveBeenCalledWith(32, `보호 모드로 재조회 보류: ${retryAt.toISOString()}`, retryAt);
  });

  it("records an exact-SKU mismatch reason and schedules the next safe lookup candidate", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-08-14T00:00:00.000Z");
    vi.setSystemTime(now);
    mocks.getNextWaitingManualLink.mockResolvedValue({ id: 33, externalProductId: "78901:1:2" });
    mocks.searchCatalogSafely.mockResolvedValue({ source: "coupang", products: [] });
    mocks.activateManualTracksForKnownProducts.mockResolvedValue(0);

    await expect(processOneWaitingManualLink()).resolves.toMatchObject({ summary: "수동 링크 일치 상품 미발견", detail: expect.stringContaining("productId·itemId·vendorItemId") });
    expect(mocks.setManualLinkWaitingError).toHaveBeenCalledWith(
      33,
      expect.stringContaining("productId·itemId·vendorItemId"),
      new Date("2026-08-14T12:00:00.000Z")
    );
    vi.useRealTimers();
  });

  it("builds an active manual-link state with the matched product and no error", () => {
    expect(buildManualTrackUpdate("active", 44)).toEqual({ status: "active", productId: 44, lastError: null, nextRetryAt: null });
  });

  it("keeps an unresolved but valid link waiting with its retry message instead of rejecting it", () => {
    const nextRetryAt = new Date("2026-08-16T00:00:00.000Z");
    expect(buildManualLookupFailureUpdate("승인된 검색 결과에서 일치 상품을 찾지 못했습니다.", nextRetryAt)).toEqual({
      status: "waiting",
      productId: null,
      lastError: "승인된 검색 결과에서 일치 상품을 찾지 못했습니다.",
      nextRetryAt,
    });
  });
});
