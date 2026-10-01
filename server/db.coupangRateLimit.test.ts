import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COUPANG_TRACKING_GLOBAL_MAX_CALLS_PER_MINUTE } from "./coupangRateLimit";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), updatePayloads: [] as unknown[] }));

vi.mock("drizzle-orm/mysql2", async importOriginal => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: mocks.drizzle };
});

describe("reserveCoupangApiCall", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.updatePayloads.length = 0;
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
    const categorySnapshot = {
      windowStartedAt: new Date("2026-08-15T17:06:00.000Z"),
      callCount: 0,
      lastCallAt: new Date("2026-08-15T17:06:30.000Z"),
      blockedUntil: null,
    };
    const globalSnapshot = { ...categorySnapshot, callCount: 46 };
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
  });

  afterEach(() => delete process.env.DATABASE_URL);

  it("persists the minute-limit reason and retry timestamp without making an external request", async () => {
    const { reserveCoupangApiCall } = await import("./db");
    const now = new Date("2026-08-15T17:06:45.000Z");

    // 전역 창이 46회로 완전히 찼으면 사용자 검색도 보류된다 — 이때가 진짜 전역 보호 모드다.
    await expect(reserveCoupangApiCall("product-search", now)).resolves.toMatchObject({ allowed: false, reason: "minute-limit", retryAt: new Date("2026-08-15T17:07:00.000Z") });
    expect(mocks.updatePayloads).toEqual([
      expect.objectContaining({
        lastError: "Coupang 전역 분당 보호 모드(minute-limit): 2026-08-15T17:07:00.000Z 이후 재개",
      }),
    ]);
  });

  // 2026-10-01: 가격 추적 호출은 전역 창에서도 검색 몫을 뺀 한도까지만 쓴다. 같은 상황이라도
  // 보류 사유가 "전역 포화"가 아니라 "검색 몫 보호"로 구분돼 기록되어야, 관리자 화면에서
  // 진짜 전역 포화와 헷갈리지 않는다. Date만 넘기는 옛 호출 형태도 추적으로 취급된다.
  it("가격 추적 호출은 검색 몫을 남기려 보류됐다는 사유로 구분해 기록한다", async () => {
    const { reserveCoupangApiCall } = await import("./db");
    const now = new Date("2026-08-15T17:06:45.000Z");

    await expect(reserveCoupangApiCall(now)).resolves.toMatchObject({ allowed: false, reason: "minute-limit" });
    expect(mocks.updatePayloads).toEqual([
      expect.objectContaining({
        lastError: `Coupang 전역 분당 예산에서 사용자 검색 몫을 남기기 위해 가격 추적 호출을 보류(가격 추적 상한 ${COUPANG_TRACKING_GLOBAL_MAX_CALLS_PER_MINUTE}회): 2026-08-15T17:07:00.000Z 이후 재개`,
      }),
    ]);
  });
});
