import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getCollectedExactSkuUrl, getCollectedProductKey, isCollectedOptionMetadataCompatible } from "./db";

const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");

describe("collector product auto-upsert", () => {
  it("creates a raw collector product master row and a first price history entry for a new productId", () => {
    expect(schema).toContain('"collection"]').not.toBeUndefined();
    expect(db).toContain('const collectionKey = getCollectedProductKey(item);');
    expect(db).toContain('externalProductId: collectionKey');
    expect(db).toContain('source: "collection"');
    expect(db).toContain('가신 수집기 자동 등록');
    expect(db).toContain('imageUrl: item.imageUrl?.trim() ?? ""');
    expect(db).toContain('const receivedOptionName = item.optionName?.trim() || null;');
    expect(db).toContain('const optionName = collectedOptionIsCompatible ? receivedOptionName : null;');
    expect(db).toContain('const packSize = extractPackSizeFromOptionName(optionName);');
    expect(db).toContain('const collectionVariant = describeProductVariant(`${collectionName} ${optionName ?? ""}`, effectivePrice, item.pageType)');
    expect(db).toContain('variantLabel: collectedOptionIsCompatible ? optionName ?? collectionVariant.variantLabel ?? "가신 수집기 상품" : null');
    expect(db).toContain('optionMetadataSource: "collection"');
    expect(db).toContain('packSize: collectedOptionIsCompatible ? packSize : null');
    expect(db).toContain('inStock: item.inStock');
    expect(db).toContain('tx.insert(priceHistory).values({ productId: created.id');
  });

  it("stores every observation but updates master information only from the latest collectedAt", () => {
    expect(db).toContain('await tx.insert(collectedPriceHistory).values({');
    expect(db).toContain('price: effectivePrice || null');
    expect(db).toContain('const latestPriceObservationAt = current.wowMemberPriceObservedAt ?? current.lastSeenAt;');
    expect(db).toContain('imageUrl: item.imageUrl?.trim() || current.imageUrl');
    expect(db).toContain('variantLabel: optionName && canReplaceMetadata ? optionName : current.variantLabel');
    expect(db).toContain('packSize: packSize && canReplaceMetadata ? packSize : current.packSize');
    expect(db).toContain('if (!item.inStock || effectivePrice <= 0)');
    expect(db).toContain('refreshState: "fresh" as const');
    expect(db).toContain('nextRefreshAt: null');
    expect(db).toContain('lastRefreshReason: item.inStock ? (current.inStock ? "가신 수집기 최신 관측 반영" : "가신 수집기 재입고 관측") : "가신 수집기 품절 관측"');
    expect(db).toContain('current.deepLinkStatus === "failed" ? { deepLinkStatus: "pending" as const, deepLinkUrl: null');
    expect(db).toContain('const duplicateObservation =');
    expect(db).toContain('if (!duplicateObservation)');
    expect(db).toContain('wowMemberPrice: effectivePrice');
    expect(db).toContain('wowMemberPriceObservedAt: item.collectedAt');
  });

  it("separates selected Coupang options by itemId and vendorItemId instead of mixing prices under a page-only productId", () => {
    expect(getCollectedProductKey({ productId: "33414098", url: "https://www.coupang.com/vp/products/33414098?itemId=8483121623&vendorItemId=92329584276" })).toBe("33414098:8483121623:92329584276");
    expect(getCollectedProductKey({ productId: "33414098", itemId: "8483121623", vendorItemId: "92329584276", url: "https://www.coupang.com/vp/products/33414098" })).toBe("33414098:8483121623:92329584276");
    expect(getCollectedProductKey({ productId: "33414098", itemId: "8483121623", vendorItemId: "92329584277", url: "https://www.coupang.com/vp/products/33414098" })).toBe("33414098:8483121623:92329584277");
    expect(getCollectedProductKey({ productId: "33414098", url: "https://www.coupang.com/vp/products/33414098" })).toBe("33414098");
    expect(getCollectedProductKey({ productId: "33414098", vendorItemId: "92329584276", url: "https://www.coupang.com/vp/products/33414098?vendorItemId=92329584276" })).toBe("33414098:vendor:92329584276");
    expect(db).toContain("const optionIds = getCoupangOptionIdsFromUrl(item.url);");
    expect(db).toContain("itemId: item.itemId?.trim() || optionIds.itemId || null");
    expect(db).toContain("vendorItemId: item.vendorItemId?.trim() || optionIds.vendorItemId || null");
    expect(db).toContain("if (vendorOnlyObservation) continue;");
  });

  it("adds the separately observed exact SKU to the direct Coupang URL before generating a deep link", () => {
    expect(getCollectedExactSkuUrl({
      productId: "9701005981",
      itemId: "29019726415",
      vendorItemId: "95950366904",
      url: "https://www.coupang.com/vp/products/9701005981",
    })).toContain("itemId=29019726415&vendorItemId=95950366904");
    expect(db).toContain("const collectedExactSkuUrl = getCollectedExactSkuUrl(item);");
    expect(db).toContain("affiliateUrl: collectedExactSkuUrl");
  });

  it("does not let an option title from an unrelated product overwrite the selected SKU metadata", () => {
    expect(isCollectedOptionMetadataCompatible("파스키에 브리오슈 초코칩", "[이상복명과] 이상복 경주빵 10개입, 380g, 1박스")).toBe(false);
    expect(isCollectedOptionMetadataCompatible("파스키에 브리오슈 초코칩", "오픈숙성1 × 개당 중량 × 수량")).toBe(true);
    expect(isCollectedOptionMetadataCompatible("파스키에 브리오슈 초코칩", "파스키에 브리오슈 초코칩 1.35kg 2개")).toBe(true);
    expect(db).toContain("const collectedOptionIsCompatible = isCollectedOptionMetadataCompatible(collectionName, receivedOptionName);");
    expect(db).toContain("variantLabel: optionName && canReplaceMetadata ? optionName : current.variantLabel");
  });

  it("recovers only a failed exact SKU link after a newer collector observation without reusing an old link", () => {
    expect(db).toContain('...(current.deepLinkStatus === "failed" ? { deepLinkStatus: "pending" as const, deepLinkUrl: null, deepLinkFailureReason: null, deepLinkUpdatedAt: new Date() } : {}),');
    expect(db).toContain('if (item.collectedAt.getTime() <= latestPriceObservationAt.getTime())');
  });

  it("retries a valid exact collector observation without letting an equal collectedAt leave the link failed", () => {
    expect(db).toContain("const canRecoverFailedLinkFromRetriedObservation = item.inStock");
    expect(db).toContain('deepLinkStatus: "pending"');
    expect(db).toContain('lastRefreshReason: "가신 수집기 재전송 관측으로 정확 SKU 구매 경로를 복구 대기 처리"');
    expect(db).toContain("pendingDeepLinkProductIds.add(current.id)");
  });

  it("promotes one page-only legacy search product to the exact collector SKU so the same mismatch does not recur", () => {
    expect(db).toContain("const canPromoteLegacySearchProduct = collectionKey !== item.productId;");
    expect(db).toContain("eq(products.externalProductId, item.productId)");
    expect(db).toContain('eq(products.source, "search")');
    expect(db).toContain("externalProductId: collectionKey");
    expect(db).toContain('source: "collection" as const');
    expect(db).toContain('"가신 수집기 SKU 승격 관측"');
  });

  it("applies a newer page-level sold-out observation to older unverified search option SKUs", () => {
    expect(db).toContain("async function applyPageSoldOutToUnverifiedSearchSkus");
    expect(db).toContain("if (item.inStock || collectorSku !== item.productId) return 0;");
    expect(db).toContain('eq(products.source, "search")');
    expect(db).toContain('like(products.externalProductId, `${item.productId}:%`)');
    expect(db).toContain('eq(products.refreshState, "deferred")');
    expect(db).toContain('eq(products.deepLinkStatus, "failed")');
    expect(db).toContain('candidate.lastSeenAt.getTime() <= item.collectedAt.getTime()');
    expect(db).toContain('lastRefreshReason: "가신 수집기 상품 페이지 품절 관측 (옵션 ID 미확인)"');
    expect(db).toContain("await applyPageSoldOutToUnverifiedSearchSkus(tx, item, collectionKey);");
  });
});
