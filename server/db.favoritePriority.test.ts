import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  drizzle: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  payloads: [] as unknown[],
}));

vi.mock("drizzle-orm/mysql2", async importOriginal => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: mocks.drizzle };
});

describe("toggleFavorite priority", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.payloads.length = 0;
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
    mocks.drizzle.mockReturnValue({ select: mocks.select, insert: mocks.insert, update: mocks.update });
    mocks.select
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: 44, source: "search" }]) }) }) })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) });
    mocks.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    mocks.update.mockReturnValue({
      set: (payload: unknown) => {
        mocks.payloads.push(payload);
        return { where: vi.fn().mockResolvedValue(undefined) };
      },
    });
  });

  afterEach(() => delete process.env.DATABASE_URL);

  it("promotes a newly favorited product and records a fresh priority timestamp", async () => {
    const before = Date.now();
    const { toggleFavorite } = await import("./db");

    await expect(toggleFavorite(21, 44)).resolves.toBe(true);

    expect(mocks.payloads).toHaveLength(1);
    expect(mocks.payloads[0]).toMatchObject({ trackingPriority: "high" });
    expect((mocks.payloads[0] as { lastViewedAt: Date }).lastViewedAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});
