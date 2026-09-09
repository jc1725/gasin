import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("duplicate product merge administration", () => {
  it("provides candidates, preview, and merge operations through administrator-only routes", () => {
    expect(router).toContain("listDuplicateCandidates: adminProcedure");
    expect(router).toContain("duplicateMergePreview: adminProcedure");
    expect(router).toContain("mergeDuplicates: adminProcedure");
    expect(router).toContain("listDuplicateProductCandidatesForAdmin");
    expect(router).toContain("getDuplicateProductMergePreview");
    expect(router).toContain("mergeDuplicateProductsForAdmin");
  });

  it("keeps a safe exact-SKU merge direction and preserves every product-bound data category", () => {
    expect(db).toContain("getSafeMergeDirection(source, target)");
    expect(db).toContain("tx.update(priceHistory).set({ productId: target.id })");
    expect(db).toContain("tx.update(userConfirmedPrices).set({ productId: target.id })");
    expect(db).toContain("tx.update(priceAlertLogs).set({ productId: target.id })");
    expect(db).toContain("tx.update(targetPriceAlertLogs).set({ productId: target.id })");
    expect(db).toContain("tx.update(manualLinkTracks).set({ productId: target.id })");
    expect(db).toContain("transferFavoritesAndCategoryEntries(tx, source.id, target.id)");
    expect(db).toContain("tx.update(categoryBestProducts).set({ productId: targetProductId })");
    expect(db).toContain("isActive: false");
  });
});
