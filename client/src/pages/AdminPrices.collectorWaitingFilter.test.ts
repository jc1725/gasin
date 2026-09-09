import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "client/src/pages/AdminPrices.tsx"), "utf8");
const router = fs.readFileSync(path.join(process.cwd(), "server/routers.ts"), "utf8");
const db = fs.readFileSync(path.join(process.cwd(), "server/db.ts"), "utf8");

describe("관리자 수집기 확인 대기 필터", () => {
  it("requests only awaiting_collection products and displays the live queue count", () => {
    expect(source).toContain("showOnlyAwaitingCollection");
    expect(source).toContain("awaitingCollectionOnly: showOnlyAwaitingCollection");
    expect(source).toContain("수집기 확인 대기 ${deferredSummary.data?.cronRecheck?.awaitingCollection ?? 0}");
    expect(source).toContain("같은 productId·itemId·vendorItemId 옵션을 수집기가 다시 관측할 때까지");
    expect(router).toContain("awaitingCollectionOnly: z.boolean().optional()");
    expect(router).toContain("if (input?.awaitingCollectionOnly) return withQueueStatus;");
    expect(db).toContain('eq(products.refreshState, "awaiting_collection")');
    expect(source).toContain("const canManageDeferredProduct = isDeferred || isAwaitingCollection;");
    expect(source).toContain("{canManageDeferredProduct && !isSoldOut ?");
    expect(source).toContain("품절");
    expect(source).toContain("삭제");
    expect(db).toContain('or(eq(products.refreshState, "deferred"), eq(products.refreshState, "awaiting_collection"))!');
  });
});
