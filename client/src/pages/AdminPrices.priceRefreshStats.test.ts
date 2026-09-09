import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./AdminPrices.tsx", import.meta.url), "utf8");

describe("administrator price refresh dashboard", () => {
  it("renders 24-hour summary metrics and hourly processing and success-rate charts", () => {
    expect(page).toContain("trpc.adminPrices.priceRefreshStats24h.useQuery");
    expect(page).toContain("trpc.adminPrices.failedPriceRefreshRuns24h.useQuery");
    expect(page).toContain("가격 갱신 작업 통계");
    expect(page).toContain("실패한 가격 갱신 작업");
    expect(page).toContain("실패 작업 · 상세 보기");
    expect(page).toContain("시간대별 처리 상품");
    expect(page).toContain("시간대별 성공률");
    expect(page).toContain("summary.successRate");
    expect(page).toContain("<BarChart");
    expect(page).toContain("<LineChart");
  });
});
