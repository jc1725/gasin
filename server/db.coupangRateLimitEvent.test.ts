import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), insertValues: [] as unknown[], updatePayloads: [] as unknown[] }));

vi.mock("drizzle-orm/mysql2", async importOriginal => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: mocks.drizzle };
});

describe("recordCoupangRateLimitEvent", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.insertValues.length = 0;
    mocks.updatePayloads.length = 0;
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
    mocks.drizzle.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        values: (payload: unknown) => {
          mocks.insertValues.push(payload);
          return Promise.resolve([{ insertId: 71 }]);
        },
      }),
      update: vi.fn().mockReturnValue({
        set: (payload: unknown) => {
          mocks.updatePayloads.push(payload);
          return { where: vi.fn().mockResolvedValue(undefined) };
        },
      }),
    });
  });

  afterEach(() => delete process.env.DATABASE_URL);

  it("persists a successful deeplink protection event with reason and retry timestamp", async () => {
    const { recordCoupangRateLimitEvent } = await import("./db");
    const retryAt = new Date("2026-08-15T17:07:00.000Z");

    await recordCoupangRateLimitEvent("deeplink", "minute-limit", retryAt);

    expect(mocks.insertValues).toEqual([{ jobType: "deeplink", status: "running" }]);
    expect(mocks.updatePayloads).toEqual([
      expect.objectContaining({
        status: "success",
        processedCount: 0,
        detail: "Coupang 전역 API 보호 모드(minute-limit): 2026-08-15T17:07:00.000Z 이후 재개",
      }),
    ]);
  });
});
