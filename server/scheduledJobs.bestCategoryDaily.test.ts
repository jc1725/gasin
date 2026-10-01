import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSearchApiQuotaStatus: vi.fn(),
  startSyncRun: vi.fn(),
  finishSyncRun: vi.fn(),
  upsertCoupangProducts: vi.fn(),
  replaceCategoryBestProducts: vi.fn(),
  markScheduleCompleted: vi.fn(),
  getCategoryBestCollectedAtByCategory: vi.fn(),
  getBestCategoryProducts: vi.fn(),
}));

vi.mock("./db", () => ({
  getSearchApiQuotaStatus: mocks.getSearchApiQuotaStatus,
  startSyncRun: mocks.startSyncRun,
  finishSyncRun: mocks.finishSyncRun,
  upsertCoupangProducts: mocks.upsertCoupangProducts,
  replaceCategoryBestProducts: mocks.replaceCategoryBestProducts,
  markScheduleCompleted: mocks.markScheduleCompleted,
  getCategoryBestCollectedAtByCategory: mocks.getCategoryBestCollectedAtByCategory,
}));
vi.mock("./coupang", () => ({
  COUPANG_BEST_CATEGORY_IDS: [1001, 1002, 1010, 1011, 1012],
  getBestCategoryProducts: mocks.getBestCategoryProducts,
  getGoldBoxProducts: vi.fn(),
  getCoupangVariantKey: vi.fn(),
}));
vi.mock("./catalogSearch", () => ({ searchCatalogSafely: vi.fn() }));
vi.mock("./deepLinks", () => ({ generatePendingDeepLinks: vi.fn().mockResolvedValue({ detail: "딥링크 없음" }) }));
vi.mock("./googleDrivePersonal", () => ({ syncProductsToPersonalGoogleDrive: vi.fn() }));
vi.mock("./coupangRateLimit", () => ({ CoupangRateLimitError: class CoupangRateLimitError extends Error {} }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));

import { CoupangRateLimitError } from "./coupangRateLimit";
import { BEST_CATEGORY_BATCH_PER_RUN, resetBestCategoryDailyState, runBestCategoryDailySchedule } from "./scheduledJobs";

// 2026-10-01: 카테고리 베스트가 Manus 전용 크론 라우트에만 묶여 이전 뒤로 한 번도 돌지 않아
// 홈 카드가 9월 16~17일 가격에 멈춰 있었다. 가격 갱신 heartbeat에 게이팅해서 얹는다.
describe("카테고리 베스트 매일 갱신 스케줄", () => {
  const at = (iso: string) => new Date(iso);

  beforeEach(() => {
    vi.clearAllMocks();
    resetBestCategoryDailyState();
    mocks.getSearchApiQuotaStatus.mockResolvedValue({ allowed: true });
    mocks.startSyncRun.mockResolvedValue(1);
    mocks.getCategoryBestCollectedAtByCategory.mockResolvedValue(new Map());
    mocks.getBestCategoryProducts.mockResolvedValue([{ productId: 1 }]);
    mocks.upsertCoupangProducts.mockResolvedValue([{ id: 10 }]);
  });

  it("오전 9시(KST) 전에는 돌지 않는다", async () => {
    await expect(runBestCategoryDailySchedule(at("2026-10-01T23:59:00Z"))).resolves.toEqual({ ran: false, reason: "오전 9시 전이라 대기" });
    expect(mocks.getBestCategoryProducts).not.toHaveBeenCalled();
  });

  it("한 번에 최대 BEST_CATEGORY_BATCH_PER_RUN개만 처리하고, 다음 실행이 나머지를 이어받는다", async () => {
    const now = at("2026-10-02T00:05:00Z"); // KST 09:05
    await runBestCategoryDailySchedule(now);
    expect(mocks.getBestCategoryProducts).toHaveBeenCalledTimes(BEST_CATEGORY_BATCH_PER_RUN);
    expect(mocks.getBestCategoryProducts.mock.calls.map(call => call[0])).toEqual([1001, 1002, 1010]);
    mocks.getBestCategoryProducts.mockClear();
    await runBestCategoryDailySchedule(now);
    expect(mocks.getBestCategoryProducts.mock.calls.map(call => call[0])).toEqual([1011, 1012]);
    mocks.getBestCategoryProducts.mockClear();
    await expect(runBestCategoryDailySchedule(now)).resolves.toEqual({ ran: false, reason: "오늘 카테고리 베스트 갱신 완료" });
    expect(mocks.getBestCategoryProducts).not.toHaveBeenCalled();
  });

  it("DB에 오늘 9시 이후 수집 기록이 있는 카테고리는 재시작 뒤에도 다시 부르지 않는다", async () => {
    const today = at("2026-10-02T00:30:00Z");
    const yesterday = at("2026-10-01T00:30:00Z");
    mocks.getCategoryBestCollectedAtByCategory.mockResolvedValue(new Map([[1001, today], [1002, today], [1010, yesterday]]));
    await runBestCategoryDailySchedule(at("2026-10-02T01:00:00Z"));
    expect(mocks.getBestCategoryProducts.mock.calls.map(call => call[0])).toEqual([1010, 1011, 1012]);
  });

  it("분당 한도에 걸리면 앞서 저장한 카테고리는 완료로 남기고 멈춘다", async () => {
    mocks.getBestCategoryProducts
      .mockResolvedValueOnce([{ productId: 1 }])
      .mockRejectedValueOnce(new CoupangRateLimitError("minute-limit"));
    const now = at("2026-10-02T00:05:00Z");
    const result = await runBestCategoryDailySchedule(now);
    expect(result.ran).toBe(true);
    expect(mocks.replaceCategoryBestProducts).toHaveBeenCalledTimes(1);
    expect(mocks.replaceCategoryBestProducts).toHaveBeenCalledWith(1001, [10]);
    mocks.getBestCategoryProducts.mockClear();
    mocks.getBestCategoryProducts.mockResolvedValue([{ productId: 1 }]);
    await runBestCategoryDailySchedule(now);
    expect(mocks.getBestCategoryProducts.mock.calls.map(call => call[0])).toEqual([1002, 1010, 1011]);
  });

  it("실패해도 throw하지 않는다(heartbeat의 가격 갱신에 영향 없음)", async () => {
    mocks.getCategoryBestCollectedAtByCategory.mockRejectedValue(new Error("db down"));
    await expect(runBestCategoryDailySchedule(at("2026-10-02T00:05:00Z"))).resolves.toEqual({ ran: true, error: "db down" });
  });

  it("heartbeat(/api/external/price-refresh)에 등록돼 있다", async () => {
    const { readFileSync } = await import("node:fs");
    const index = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
    expect(index).toContain("runBestCategoryDailySchedule(),");
  });
});
