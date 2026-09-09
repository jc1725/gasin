import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

    await expect(reserveCoupangApiCall(now)).resolves.toMatchObject({ allowed: false, reason: "minute-limit", retryAt: new Date("2026-08-15T17:07:00.000Z") });
    expect(mocks.updatePayloads).toEqual([
      expect.objectContaining({
        lastError: "Coupang 전역 분당 보호 모드(minute-limit): 2026-08-15T17:07:00.000Z 이후 재개",
      }),
    ]);
  });
});
