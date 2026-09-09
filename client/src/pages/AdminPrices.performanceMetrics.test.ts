import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./AdminPrices.tsx", import.meta.url), "utf8");
const router = readFileSync(new URL("../../../server/routers.ts", import.meta.url), "utf8");

describe("administrator tracking performance monitor", () => {
  it("loads and visualizes seven-day SKU resolution and API usage metrics", () => {
    expect(page).toContain("trpc.adminPrices.priceTrackingPerformanceMetrics.useQuery");
    expect(page).toContain("가격 추적 성과 모니터링");
    expect(page).toContain("보류 SKU 평균 해소");
    expect(page).toContain("상품당 API 호출");
    expect(page).toContain("수집기 해소 비율");
    expect(page).toContain("performanceMetrics.data.daily");
    expect(page).toContain("dataKey=\"matched\"");
    expect(page).toContain("dataKey=\"collectorResolved\"");
  });

  it("protects the performance metrics endpoint with the admin procedure", () => {
    expect(router).toContain("priceTrackingPerformanceMetrics: adminProcedure");
    expect(router).toContain("getPriceTrackingPerformanceMetrics(input?.days)");
  });
});
