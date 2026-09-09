import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("administrator full price-refresh queue", () => {
  it("uses the administrator procedure and preserves Google-only administration", () => {
    expect(router).toContain("enqueueAllSearchProductsForPriceRefresh: adminProcedure.mutation");
    expect(router).toContain("requireGoogleUser(ctx.user.loginMethod)");
    expect(router).toContain("const queuedCount = await enqueueAllSearchProductsForPriceRefresh()");
  });

  it("exposes the favorites-only queue action only through the administrator procedure", () => {
    expect(router).toContain("enqueueFavoritedProductsForPriceRefresh: adminProcedure.mutation");
    expect(router).toContain("const result = await enqueueFavoritedProductsForPriceRefresh()");
  });
});
