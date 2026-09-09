import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), select: vi.fn(), update: vi.fn(), payloads: [] as unknown[] }));

vi.mock("drizzle-orm/mysql2", async importOriginal => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: mocks.drizzle };
});

describe("markProductViewed", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.payloads.length = 0;
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
    mocks.drizzle.mockReturnValue({ select: mocks.select, update: mocks.update });
    mocks.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: 74, trackingPriority: "low" }]) }) }),
    });
    mocks.update.mockReturnValue({
      set: (payload: unknown) => {
        mocks.payloads.push(payload);
        return { where: vi.fn().mockResolvedValue(undefined) };
      },
    });
  });

  afterEach(() => delete process.env.DATABASE_URL);

  it("stores the view timestamp and promotes a low-priority product to normal", async () => {
    const before = Date.now();
    const { markProductViewed } = await import("./db");

    await markProductViewed(74);

    expect(mocks.payloads).toHaveLength(1);
    expect(mocks.payloads[0]).toMatchObject({ trackingPriority: "normal" });
    expect((mocks.payloads[0] as { lastViewedAt: Date }).lastViewedAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});
