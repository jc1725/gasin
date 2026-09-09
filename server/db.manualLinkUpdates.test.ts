import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  drizzle: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  setCalls: [] as Array<{ table: unknown; payload: unknown }>,
}));

vi.mock("drizzle-orm/mysql2", async importOriginal => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: mocks.drizzle };
});

describe("manual-link DB update helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.setCalls.length = 0;
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
    mocks.drizzle.mockReturnValue({ select: mocks.select, update: mocks.update });
    mocks.update.mockImplementation((table: unknown) => ({
      set: (payload: unknown) => {
        mocks.setCalls.push({ table, payload });
        return { where: vi.fn().mockResolvedValue(undefined) };
      },
    }));
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  it("passes the waiting error payload to update().set()", async () => {
    const { setManualLinkWaitingError } = await import("./db");

    const nextRetryAt = new Date("2026-08-16T00:00:00.000Z");
    await setManualLinkWaitingError(31, "승인된 검색 결과에서 일치 상품을 찾지 못했습니다.", nextRetryAt);

    expect(mocks.setCalls).toHaveLength(1);
    expect(mocks.setCalls[0]?.payload).toEqual({
      status: "waiting",
      productId: null,
      lastError: "승인된 검색 결과에서 일치 상품을 찾지 못했습니다.",
      nextRetryAt,
    });
  });

  it("passes the active payload to update().set() and raises the matched product priority", async () => {
    const waitingTrack = { id: 52, externalProductId: "12345:1:2" };
    const matchedProduct = { id: 88 };
    const selectFrom = vi
      .fn()
      .mockReturnValueOnce({ where: vi.fn().mockResolvedValue([waitingTrack]) })
      .mockReturnValueOnce({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([matchedProduct]) }) });
    mocks.select.mockReturnValue({ from: selectFrom });
    const { activateManualTracksForKnownProducts } = await import("./db");

    await expect(activateManualTracksForKnownProducts()).resolves.toBe(1);

    expect(mocks.setCalls.map(call => call.payload)).toEqual([
      { status: "active", productId: 88, lastError: null, nextRetryAt: null },
      { trackingPriority: "high" },
    ]);
  });

  it("activates an item-ID-only partner link only when it maps to one option SKU", async () => {
    const waitingTrack = { id: 53, externalProductId: "9640170508:28803754031" };
    const matchedProduct = { id: 89 };
    const selectFrom = vi
      .fn()
      .mockReturnValueOnce({ where: vi.fn().mockResolvedValue([waitingTrack]) })
      .mockReturnValueOnce({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) })
      .mockReturnValueOnce({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([matchedProduct]) }) });
    mocks.select.mockReturnValue({ from: selectFrom });
    const { activateManualTracksForKnownProducts } = await import("./db");

    await expect(activateManualTracksForKnownProducts()).resolves.toBe(1);
    expect(mocks.setCalls.map(call => call.payload)).toEqual([
      { status: "active", productId: 89, lastError: null, nextRetryAt: null },
      { trackingPriority: "high" },
    ]);
  });
});
