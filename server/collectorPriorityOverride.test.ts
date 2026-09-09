import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isSupersededSearchSkuForCollector } from "./db";

const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const collectorSku = "7629610794:24132940470:94131044924";

describe("수집기 관측 우선 SKU 교체", () => {
  it("같은 상품 ID의 대기·실패 검색 SKU는 수집기가 확인한 정확 SKU로 교체 대상으로 판정한다", () => {
    expect(isSupersededSearchSkuForCollector({
      externalProductId: "7629610794:28270438268:94131044924",
      source: "search",
      isActive: true,
      refreshState: "awaiting_collection",
      deepLinkStatus: "failed",
    }, collectorSku)).toBe(true);
    expect(isSupersededSearchSkuForCollector({
      externalProductId: "7629610794:28270438268:94131044924",
      source: "search",
      isActive: true,
      refreshState: "fresh",
      deepLinkStatus: "ready",
    }, collectorSku)).toBe(true);
    expect(isSupersededSearchSkuForCollector({
      externalProductId: "7629610794:28270438268:94131044924",
      source: "goldbox",
      isActive: true,
      refreshState: "fresh",
      deepLinkStatus: "ready",
    }, collectorSku)).toBe(true);
    expect(isSupersededSearchSkuForCollector({
      externalProductId: "7629610795:28270438268:94131044924",
      source: "search",
      isActive: true,
      refreshState: "awaiting_collection",
      deepLinkStatus: "failed",
    }, collectorSku)).toBe(false);
    expect(isSupersededSearchSkuForCollector({
      externalProductId: "7629610794:28270438268:95223575593",
      source: "search",
      isActive: true,
      refreshState: "fresh",
      deepLinkStatus: "ready",
    }, collectorSku)).toBe(false);
  });

  it("기존 사용자 연결은 수집기 SKU로 이관하고 이전 대기 SKU는 비활성화한다", () => {
    expect(db).toContain("async function supersedeSearchSkusWithCollectorObservation");
    expect(db).toContain("transferFavoritesAndCategoryEntries(tx, source.id, collectorProductId)");
    expect(db).toContain("tx.update(favorites).set({ productId: targetProductId })");
    expect(db).toContain("tx.update(userConfirmedPrices).set({ productId: collectorProductId })");
    expect(db).toContain("tx.update(manualLinkTracks).set({ productId: collectorProductId })");
    expect(db).toContain("isActive: false");
    expect(db).toContain("수집기 정확 SKU");
  });
});
