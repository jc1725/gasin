import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COUPANG_API_MAX_CALLS_PER_MINUTE, COUPANG_TRACKING_GLOBAL_MAX_CALLS_PER_MINUTE, COUPANG_USER_SEARCH_MAX_CALLS_PER_MINUTE } from "./coupangRateLimit";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), updatePayloads: [] as unknown[] }));

vi.mock("drizzle-orm/mysql2", async importOriginal => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: mocks.drizzle };
});

/**
 * 2026-10-01: 전역 창과 카테고리 창이 독립적으로 굴러서, 추적 호출이 전역 예산을
 * 다 쓰면 사용자 검색이 자기 창은 멀쩡히 비어 있는데도 minute-limit으로 거부됐다.
 * 이제 추적 호출은 전역 창에서도 검색 몫을 남긴 한도까지만 쓴다.
 */
describe("가격 추적 호출이 전역 예산에서 검색 몫을 남긴다", () => {
  const windowStartedAt = new Date("2026-10-01T05:09:00.000Z");
  const now = new Date("2026-10-01T05:09:30.000Z");

  function setupQuotas(globalCallCount: number, categoryCallCount = 0) {
    const categorySnapshot = { windowStartedAt, callCount: categoryCallCount, lastCallAt: windowStartedAt, blockedUntil: null };
    const globalSnapshot = { windowStartedAt, callCount: globalCallCount, lastCallAt: windowStartedAt, blockedUntil: null };
    const limit = vi.fn().mockResolvedValueOnce([categorySnapshot]).mockResolvedValueOnce([globalSnapshot]);
    const tx = {
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit }) }) }),
      update: vi.fn().mockReturnValue({
        set: (payload: unknown) => {
          mocks.updatePayloads.push(payload);
          return { where: vi.fn().mockResolvedValue(undefined) };
        },
      }),
      insert: vi.fn(),
    };
    mocks.drizzle.mockReturnValue({ transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) });
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.updatePayloads.length = 0;
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
  });

  afterEach(() => delete process.env.DATABASE_URL);

  it("예산 상수가 전역 = 추적 + 검색으로 맞아떨어진다", () => {
    expect(COUPANG_TRACKING_GLOBAL_MAX_CALLS_PER_MINUTE + COUPANG_USER_SEARCH_MAX_CALLS_PER_MINUTE).toBe(COUPANG_API_MAX_CALLS_PER_MINUTE);
    expect(COUPANG_TRACKING_GLOBAL_MAX_CALLS_PER_MINUTE).toBeLessThan(COUPANG_API_MAX_CALLS_PER_MINUTE);
  });

  it("전역 창이 추적 몫까지 찼으면 추적 호출을 보류한다", async () => {
    setupQuotas(COUPANG_TRACKING_GLOBAL_MAX_CALLS_PER_MINUTE);
    const { reserveCoupangApiCall } = await import("./db");
    await expect(reserveCoupangApiCall("price-tracking", now)).resolves.toMatchObject({ allowed: false, reason: "minute-limit" });
    expect(mocks.updatePayloads).toEqual([
      expect.objectContaining({ lastError: expect.stringContaining("사용자 검색 몫을 남기기 위해") }),
    ]);
  });

  it("같은 상황에서 사용자 검색은 그대로 통과한다 — 이게 이번 수정의 핵심이다", async () => {
    setupQuotas(COUPANG_TRACKING_GLOBAL_MAX_CALLS_PER_MINUTE);
    const { reserveCoupangApiCall } = await import("./db");
    await expect(reserveCoupangApiCall("product-search", now)).resolves.toMatchObject({ allowed: true });
  });

  it("전역 창이 완전히 차면 사용자 검색도 보류한다(쿠팡 실제 한도 보호)", async () => {
    setupQuotas(COUPANG_API_MAX_CALLS_PER_MINUTE);
    const { reserveCoupangApiCall } = await import("./db");
    await expect(reserveCoupangApiCall("product-search", now)).resolves.toMatchObject({ allowed: false, reason: "minute-limit" });
    expect(mocks.updatePayloads).toEqual([
      expect.objectContaining({ lastError: expect.stringContaining("전역 분당 보호 모드") }),
    ]);
  });
});
