import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../client/src/pages/AdminPrices.tsx", import.meta.url), "utf8");

describe("admin deferred manual input visibility", () => {
  it("supports restricting deferred queries to the classified manual product IDs", () => {
    expect(dbSource).toContain("productIds?: number[]");
    expect(dbSource).toContain("conditions.push(inArray(products.id, options.productIds));");
    expect(routerSource).toContain("manualOnly: z.boolean().optional()");
    expect(routerSource).toContain("listAllDeferredProductsForAdminSummary()");
    expect(routerSource).toContain("productIds: summaryClassification ? Array.from(summaryClassification.manualProductIds) : undefined");
  });

  it("requests manual-only data when the default confirmation filter is active", () => {
    expect(pageSource).toContain("manualOnly: showOnlyNeedsConfirmation");
  });
});
