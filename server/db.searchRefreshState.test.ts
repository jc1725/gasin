import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), update: vi.fn(), select: vi.fn(), payloads: [] as unknown[] }));

vi.mock("drizzle-orm/mysql2", async importOriginal => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: mocks.drizzle };
});

describe("deferSearchProductRefresh", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.payloads.length = 0;
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
    mocks.drizzle.mockReturnValue({ update: mocks.update, select: mocks.select });
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: vi.fn().mockResolvedValue([]) }), then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve([]).then(resolve, reject) }) });
    mocks.update.mockReturnValue({
      set: (payload: unknown) => {
        mocks.payloads.push(payload);
        return { where: vi.fn().mockResolvedValue([{ affectedRows: 7 }]) };
      },
    });
  });

  afterEach(() => delete process.env.DATABASE_URL);

  it("stores a deferred state and transparent reason for search-origin products", async () => {
    const { deferSearchProductRefresh } = await import("./db");

    await expect(deferSearchProductRefresh([11, 12])).resolves.toBe(2);
    expect(mocks.payloads).toHaveLength(1);
    expect(mocks.payloads[0]).toMatchObject({ refreshState: "deferred" });
    expect(mocks.payloads[0]).toHaveProperty("lastRefreshReason");
    expect(mocks.payloads[0]).toHaveProperty("nextRefreshAt");
  });

  it("moves an exact-SKU miss to collector observation waiting instead of repeating official API retries", async () => {
    const { recordDeferredSearchRecheckMiss, SEARCH_RECHECK_MISS_DELAY_MS, SEARCH_REFRESH_INTERVAL_MS } = await import("./db");
    const attemptedAt = new Date("2026-08-25T04:10:00.000Z");

    await recordDeferredSearchRecheckMiss(11, "정확 SKU 미일치", attemptedAt);

    expect(mocks.payloads).toHaveLength(1);
    expect(mocks.payloads[0]).toMatchObject({
      refreshState: "awaiting_collection",
      lastRefreshAttemptAt: attemptedAt,
      nextRefreshAt: null,
      deepLinkStatus: "failed",
      deepLinkUrl: null,
      deepLinkUpdatedAt: attemptedAt,
    });
    expect(mocks.payloads[0]).toHaveProperty("lastRefreshReason");
    expect(SEARCH_RECHECK_MISS_DELAY_MS).toBe(SEARCH_REFRESH_INTERVAL_MS);
  });

  it("keeps a recent exact-SKU extension observation and its existing deep link when the official search misses", async () => {
    const { recordDeferredSearchRecheckMiss } = await import("./db");
    const attemptedAt = new Date("2026-08-27T03:00:00.000Z");
    mocks.select.mockReturnValueOnce({ from: () => ({ where: () => ({ limit: vi.fn().mockResolvedValue([{
      inStock: true,
      wowMemberPrice: 159800,
      wowMemberPriceObservedAt: new Date("2026-08-27T02:55:00.000Z"),
      deepLinkStatus: "ready",
      deepLinkUrl: "https://link.coupang.com/re/AFFSDP?exact-sku",
    }]) }) }) });

    await expect(recordDeferredSearchRecheckMiss(11, "정확 SKU 미일치", attemptedAt)).resolves.toBe("collector_trusted");

    expect(mocks.payloads[0]).toMatchObject({
      refreshState: "fresh",
      deepLinkStatus: "ready",
      lastRefreshAttemptAt: attemptedAt,
      nextRefreshAt: null,
    });
    expect(mocks.payloads[0]).not.toHaveProperty("deepLinkUrl", null);
  });

  it("queues every active in-stock search product immediately when an administrator requests a full refresh", async () => {
    const { enqueueAllSearchProductsForPriceRefresh } = await import("./db");
    const queuedAt = new Date("2026-08-25T14:00:00.000Z");

    await expect(enqueueAllSearchProductsForPriceRefresh(queuedAt)).resolves.toBe(7);
    expect(mocks.payloads).toContainEqual({
      refreshState: "deferred",
      lastRefreshReason: "관리자 전체 가격 재확인 대기열 등록",
      nextRefreshAt: queuedAt,
    });
  });

  it("queues distinct favorited products and reports the affected count", async () => {
    const { enqueueFavoritedProductsForPriceRefresh } = await import("./db");
    const queuedAt = new Date("2026-08-25T15:00:00.000Z");
    mocks.select.mockReturnValueOnce({ from: () => ({ then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve([{ productId: 21 }, { productId: 21 }, { productId: 22 }]).then(resolve, reject) }) });

    await expect(enqueueFavoritedProductsForPriceRefresh(queuedAt)).resolves.toEqual({ favoriteCount: 2, queuedCount: 7, skippedCount: 0 });
    expect(mocks.payloads).toContainEqual({
      refreshState: "awaiting_collection",
      lastRefreshReason: "관리자 찜한 상품 수집기 가격 업데이트 대상 등록",
      nextRefreshAt: null,
    });
  });

  it("keeps a Search API transport error retryable without changing the SKU or deep-link state", async () => {
    const { recordDeferredSearchRecheckError, SEARCH_RECHECK_ERROR_DELAY_MS } = await import("./db");
    const attemptedAt = new Date("2026-08-27T06:45:00.000Z");

    await recordDeferredSearchRecheckError(11, "Coupang API error 400: keyword maximum length is 50", attemptedAt);

    expect(mocks.payloads).toHaveLength(1);
    expect(mocks.payloads[0]).toMatchObject({
      refreshState: "deferred",
      lastRefreshAttemptAt: attemptedAt,
      nextRefreshAt: new Date(attemptedAt.getTime() + SEARCH_RECHECK_ERROR_DELAY_MS),
    });
    expect(mocks.payloads[0]).toHaveProperty("lastRefreshReason", expect.stringContaining("keyword maximum length is 50"));
    expect(mocks.payloads[0]).not.toHaveProperty("deepLinkStatus");
  });
});
