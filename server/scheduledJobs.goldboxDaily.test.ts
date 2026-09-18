import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSearchApiQuotaStatus: vi.fn(),
  startSyncRun: vi.fn(),
  finishSyncRun: vi.fn(),
  upsertCoupangProducts: vi.fn(),
  deactivateStaleProductsForSource: vi.fn(),
  activateManualTracksForKnownProducts: vi.fn(),
  markScheduleCompleted: vi.fn(),
  getLatestSyncRun: vi.fn(),
  getGoogleDriveSnapshotConnection: vi.fn(),
  getGoldBoxProducts: vi.fn(),
}));

vi.mock("./db", () => ({
  getSearchApiQuotaStatus: mocks.getSearchApiQuotaStatus,
  startSyncRun: mocks.startSyncRun,
  finishSyncRun: mocks.finishSyncRun,
  upsertCoupangProducts: mocks.upsertCoupangProducts,
  deactivateStaleProductsForSource: mocks.deactivateStaleProductsForSource,
  activateManualTracksForKnownProducts: mocks.activateManualTracksForKnownProducts,
  markScheduleCompleted: mocks.markScheduleCompleted,
  getLatestSyncRun: mocks.getLatestSyncRun,
  getGoogleDriveSnapshotConnection: mocks.getGoogleDriveSnapshotConnection,
}));
vi.mock("./coupang", () => ({
  COUPANG_BEST_CATEGORY_IDS: [1001],
  getBestCategoryProducts: vi.fn(),
  getGoldBoxProducts: mocks.getGoldBoxProducts,
  getCoupangVariantKey: vi.fn(),
}));
vi.mock("./catalogSearch", () => ({ searchCatalogSafely: vi.fn() }));
vi.mock("./deepLinks", () => ({ generatePendingDeepLinks: vi.fn().mockResolvedValue({ detail: "딥링크 없음" }) }));
vi.mock("./googleDrivePersonal", () => ({ syncProductsToPersonalGoogleDrive: vi.fn() }));
vi.mock("./coupangRateLimit", () => ({ CoupangRateLimitError: class CoupangRateLimitError extends Error {} }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));

import { collectGoldBoxProducts, runGoldBoxDailySchedule } from "./scheduledJobs";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** KST 벽시계 시각을 실제 UTC Date로 변환하는 테스트 헬퍼. */
function kst(year: number, month: number, day: number, hour: number, minute = 0) {
  return new Date(Date.UTC(year, month, day, hour, minute, 0) - KST_OFFSET_MS);
}

describe("골드박스 전체 갱신 시 오래된 상품 내리기", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSearchApiQuotaStatus.mockResolvedValue({ allowed: true });
    mocks.startSyncRun.mockResolvedValue(1);
    mocks.getGoogleDriveSnapshotConnection.mockResolvedValue(null);
    mocks.activateManualTracksForKnownProducts.mockResolvedValue(0);
    mocks.deactivateStaleProductsForSource.mockResolvedValue({ deactivatedCount: 0 });
    mocks.getGoldBoxProducts.mockResolvedValue([
      { productId: 1, productName: "상품 1", productPrice: 1000, productImage: "https://image.example/1.jpg", productUrl: "https://www.coupang.com/vp/products/1" },
    ]);
    mocks.upsertCoupangProducts.mockImplementation(async (offers: Array<{ productId: number }>) =>
      offers.map(offer => ({ id: offer.productId, externalProductId: String(offer.productId) })),
    );
  });

  it("이번 갱신에서 실제로 저장된 externalProductId 목록으로 오래된 골드박스 상품을 내린다", async () => {
    mocks.deactivateStaleProductsForSource.mockResolvedValue({ deactivatedCount: 5 });
    const result = await collectGoldBoxProducts();
    expect(mocks.deactivateStaleProductsForSource).toHaveBeenCalledWith("goldbox", ["1"]);
    expect(result).toMatchObject({ processedCount: 1 });
    expect((result as { detail?: string }).detail).toContain("5개는 이번 목록에 없어 화면에서 내렸습니다");
  });
});

describe("골드박스 매일 오후 8시(KST) 자동 갱신 스케줄", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSearchApiQuotaStatus.mockResolvedValue({ allowed: true });
    mocks.startSyncRun.mockResolvedValue(1);
    mocks.getGoogleDriveSnapshotConnection.mockResolvedValue(null);
    mocks.activateManualTracksForKnownProducts.mockResolvedValue(0);
    mocks.deactivateStaleProductsForSource.mockResolvedValue({ deactivatedCount: 0 });
    mocks.getGoldBoxProducts.mockResolvedValue([]);
    mocks.upsertCoupangProducts.mockResolvedValue([]);
  });

  it("오후 8시 이전이면 실행하지 않는다", async () => {
    mocks.getLatestSyncRun.mockResolvedValue(undefined);
    const result = await runGoldBoxDailySchedule(kst(2026, 8, 18, 19, 59));
    expect(result).toMatchObject({ ran: false });
    expect(mocks.getGoldBoxProducts).not.toHaveBeenCalled();
  });

  it("오후 8시 이후 오늘 아직 성공 기록이 없으면 실행한다", async () => {
    mocks.getLatestSyncRun.mockResolvedValue(undefined);
    const result = await runGoldBoxDailySchedule(kst(2026, 8, 18, 20, 0));
    expect(result).toMatchObject({ ran: true });
    expect(mocks.getGoldBoxProducts).toHaveBeenCalledTimes(1);
    expect(mocks.markScheduleCompleted).toHaveBeenCalledWith("goldbox");
  });

  it("오늘 오후 8시 이후 이미 성공했으면 다시 실행하지 않는다", async () => {
    mocks.getLatestSyncRun.mockResolvedValue({ status: "success", startedAt: kst(2026, 8, 18, 20, 5) });
    const result = await runGoldBoxDailySchedule(kst(2026, 8, 18, 21, 0));
    expect(result).toMatchObject({ ran: false });
    expect(mocks.getGoldBoxProducts).not.toHaveBeenCalled();
  });

  it("어제 8시 이후 성공 기록만 있으면(오늘 것 아님) 오늘 다시 실행한다", async () => {
    mocks.getLatestSyncRun.mockResolvedValue({ status: "success", startedAt: kst(2026, 8, 17, 20, 5) });
    const result = await runGoldBoxDailySchedule(kst(2026, 8, 18, 20, 10));
    expect(result).toMatchObject({ ran: true });
    expect(mocks.getGoldBoxProducts).toHaveBeenCalledTimes(1);
  });

  it("직전 시도가 3분 이내에 실패했으면 재시도하지 않고 기다린다", async () => {
    mocks.getLatestSyncRun.mockResolvedValue({ status: "failed", startedAt: kst(2026, 8, 18, 20, 10) });
    const result = await runGoldBoxDailySchedule(kst(2026, 8, 18, 20, 12));
    expect(result).toMatchObject({ ran: false });
    expect(mocks.getGoldBoxProducts).not.toHaveBeenCalled();
  });

  it("직전 실패로부터 3분이 지나면 재시도한다", async () => {
    mocks.getLatestSyncRun.mockResolvedValue({ status: "failed", startedAt: kst(2026, 8, 18, 20, 10) });
    const result = await runGoldBoxDailySchedule(kst(2026, 8, 18, 20, 14));
    expect(result).toMatchObject({ ran: true });
    expect(mocks.getGoldBoxProducts).toHaveBeenCalledTimes(1);
  });

  it("실행 중 에러가 나도 throw하지 않는다(가격 갱신 신호에 영향 안 줌)", async () => {
    mocks.getLatestSyncRun.mockResolvedValue(undefined);
    mocks.getGoldBoxProducts.mockRejectedValue(new Error("Coupang API 오류"));
    const result = await runGoldBoxDailySchedule(kst(2026, 8, 18, 20, 0));
    expect(result).toMatchObject({ ran: true, error: "Coupang API 오류" });
  });
});
