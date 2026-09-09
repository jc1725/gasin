import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProductById: vi.fn(),
  recordDeferredSearchRecheckMiss: vi.fn(),
  searchCatalogSafely: vi.fn(),
  generatePendingDeepLinkForProduct: vi.fn(),
}));

vi.mock("./db", () => ({
  getProductById: mocks.getProductById,
  recordDeferredSearchRecheckMiss: mocks.recordDeferredSearchRecheckMiss,
}));
vi.mock("./catalogSearch", () => ({ searchCatalogSafely: mocks.searchCatalogSafely }));
vi.mock("./deepLinks", () => ({ generatePendingDeepLinkForProduct: mocks.generatePendingDeepLinkForProduct }));

import { refreshDeepLinkForExactSku } from "./deepLinkManualRefresh";

const product = {
  id: 41,
  name: "클레어 아이씨 클린트 치약",
  externalProductId: "7507686267:23951397988:95964907456",
  isActive: true,
  inStock: true,
  deepLinkStatus: "failed",
  deepLinkUrl: null,
};

describe("관리자 단건 딥링크 갱신", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProductById.mockResolvedValue(product);
  });

  it("공식 검색에서 정확 SKU가 재확인되면 그 상품의 링크만 새로 생성한다", async () => {
    mocks.searchCatalogSafely.mockResolvedValue({ source: "coupang", products: [{ id: 41, externalProductId: product.externalProductId }] });
    mocks.getProductById
      .mockResolvedValueOnce(product)
      .mockResolvedValueOnce({ ...product, deepLinkStatus: "pending", deepLinkUrl: null })
      .mockResolvedValueOnce({ ...product, deepLinkStatus: "ready", deepLinkUrl: "https://link.coupang.com/a/new" });
    mocks.generatePendingDeepLinkForProduct.mockResolvedValue({ processedCount: 1, detail: "새 링크 생성" });

    await expect(refreshDeepLinkForExactSku(41)).resolves.toEqual({ status: "ready", message: "정확 SKU를 확인하고 새 딥링크를 생성했습니다." });
    expect(mocks.searchCatalogSafely).toHaveBeenCalledWith(product.name, 10, { forceExternal: true, callType: "price-tracking" });
    expect(mocks.generatePendingDeepLinkForProduct).toHaveBeenCalledWith(41);
    expect(mocks.recordDeferredSearchRecheckMiss).not.toHaveBeenCalled();
  });

  it("유사 검색 결과만 있으면 링크를 만들지 않고 실패 상태로 유지한다", async () => {
    mocks.searchCatalogSafely.mockResolvedValue({ source: "coupang", products: [{ id: 99, externalProductId: "다른-옵션-SKU" }] });

    await expect(refreshDeepLinkForExactSku(41)).resolves.toMatchObject({ status: "not_found", message: expect.stringContaining("다른 옵션으로 연결하지 않습니다") });
    expect(mocks.recordDeferredSearchRecheckMiss).toHaveBeenCalledWith(41, expect.stringContaining("모두 일치"));
    expect(mocks.generatePendingDeepLinkForProduct).not.toHaveBeenCalled();
  });

  it("API 보호 모드에서는 추가 생성 없이 재시도 안내를 반환한다", async () => {
    const retryAt = new Date("2026-08-27T02:00:00.000Z");
    mocks.searchCatalogSafely.mockResolvedValue({ source: "rate_limited", products: [], retryAt });

    await expect(refreshDeepLinkForExactSku(41)).resolves.toMatchObject({ status: "rate_limited", message: expect.stringContaining("다시 시도") });
    expect(mocks.generatePendingDeepLinkForProduct).not.toHaveBeenCalled();
  });

  it("공식 결과가 없어도 최근 수집기가 확인한 정확 SKU 원본 구매 경로를 유지한다", async () => {
    const observedAt = new Date();
    const collectorVerifiedProduct = {
      ...product,
      affiliateUrl: "https://www.coupang.com/vp/products/7507686267?itemId=23951397988&vendorItemId=95964907456",
      wowMemberPrice: 17880,
      wowMemberPriceObservedAt: observedAt,
    };
    mocks.searchCatalogSafely.mockResolvedValue({ source: "coupang", products: [] });
    mocks.recordDeferredSearchRecheckMiss.mockResolvedValue("collector_trusted");
    mocks.getProductById
      .mockResolvedValueOnce(product)
      .mockResolvedValueOnce(collectorVerifiedProduct);
    mocks.generatePendingDeepLinkForProduct.mockResolvedValue({ processedCount: 0, detail: "제휴 링크 생성 결과 없음" });

    await expect(refreshDeepLinkForExactSku(41)).resolves.toMatchObject({
      status: "collector_verified",
      message: expect.stringContaining("원본 쿠팡 상품 경로를 유지"),
    });
  });
});
