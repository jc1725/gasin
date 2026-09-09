import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./AdminPrices.tsx", import.meta.url), "utf8");
const db = readFileSync(new URL("../../../server/db.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("../../../server/routers.ts", import.meta.url), "utf8");

describe("administrator image-missing products filter", () => {
  it("uses an administrator query flag to request active products without images", () => {
    expect(page).toContain('const [showOnlyMissingImage, setShowOnlyMissingImage] = useState(false)');
    expect(page).toContain('imageMissingOnly: showOnlyMissingImage && !showOnlySoldOut && !showOnlyAwaitingCollection');
    expect(page).toContain('awaitingCollectionOnly: showOnlyAwaitingCollection && !showOnlySoldOut && !showOnlyMissingImage');
    expect(page).toContain('"이미지 없음만"');
    expect(router).toContain('imageMissingOnly: z.boolean().optional()');
    expect(router).toContain('automaticOnly: z.boolean().optional()');
    expect(router).toContain('unmatchedSkuOnly: z.boolean().optional()');
    expect(router).toContain('awaitingCollectionOnly: z.boolean().optional()');
    expect(router).toContain('awaitingCollectionOnly: input?.awaitingCollectionOnly === true');
    expect(db).toContain('or(isNull(products.imageUrl), eq(products.imageUrl, ""))');
  });

  it("shows the manual-input total separately from automatic recheck waiting products", () => {
    expect(page).toContain("trpc.adminPrices.deferredInputSummary.useQuery");
    expect(page).toContain("수동 가격 입력 필요");
    expect(page).toContain("자동 재확인 대상");
    expect(page).toContain("지금 처리");
    expect(page).toContain("자동 대기");
    expect(page).toContain("다음 API 재확인");
    expect(page).toContain("SKU 미일치");
    expect(router).toContain('product.lastRefreshReason?.includes("정확 SKU 미일치")');
    expect(router).toContain("deferredInputSummary: adminProcedure.query");
    expect(router).toContain("nextRefreshAt");
  });

  it("lets administrators remove stale failure records that already match stored products without using the external API", () => {
    expect(page).toContain("pruneResolvedMissingSearches.useMutation");
    expect(page).toContain("저장 상품 기준 자동 정리");
    expect(router).toContain("pruneResolvedMissingSearches: adminProcedure.mutation");
    expect(db).toContain("pruneResolvedMissingSearchesForAdmin");
    expect(db).toContain("rankSearchResults(item.keyword, activeProducts)");
  });

  it("shows price, lowest price, variant metadata, and unit price for filtered collection products", () => {
    expect(db).toContain('lowestPrice: products.lowestPrice');
    expect(db).toContain('unitPrice: products.unitPrice');
    expect(page).toContain('현재가 {won(product.currentPrice)} · 최저가 {won(product.lowestPrice)}');
    expect(page).toContain('용량 {metaTags.capacity}');
    expect(page).toContain('수량 {metaTags.quantity}');
    expect(page).toContain('{product.unitLabel}당 {won(product.unitPrice)}');
  });
});
