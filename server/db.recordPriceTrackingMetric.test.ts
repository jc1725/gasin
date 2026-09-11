import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), insertValues: [] as unknown[] }));

vi.mock("drizzle-orm/mysql2", async importOriginal => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: mocks.drizzle };
});

describe("recordPriceTrackingMetric", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.insertValues.length = 0;
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
  });

  afterEach(() => delete process.env.DATABASE_URL);

  it("records a metric row normally when the insert succeeds", async () => {
    mocks.drizzle.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        values: (payload: unknown) => {
          mocks.insertValues.push(payload);
          return Promise.resolve([{ insertId: 1 }]);
        },
      }),
    });

    const { recordPriceTrackingMetric } = await import("./db");
    await recordPriceTrackingMetric({ productId: 41, source: "search", outcome: "matched", apiCalls: 1, durationMs: 250 });

    expect(mocks.insertValues).toEqual([
      expect.objectContaining({ productId: 41, runId: null, source: "search", outcome: "matched", apiCalls: 1, durationMs: 250 }),
    ]);
  });

  // 실제로 재현된 사고: 관리자가 admin/prices에서 "보류" 상품을 삭제하는 시점이 하필
  // 예약 가격 갱신 작업이 같은 상품을 처리 중인 순간과 겹치면, products 행이 이미
  // 사라진 뒤라 productId 외래키 제약 위반으로 이 메트릭 insert가 실패한다. 이 함수를
  // 호출하는 for 루프 바깥에는 try/catch가 없으므로, 예외가 그대로 전파되면 나머지
  // 후보 상품은 전혀 처리되지 못한 채 작업 전체가 "실패·처리 상품 0개"로 끝난다.
  it("실패해도 예외를 던지지 않고 경고만 남긴다(동시 삭제로 인한 FK 위반 등)", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fkError = new Error("Cannot add or update a child row: a foreign key constraint fails");
    mocks.drizzle.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockRejectedValue(fkError),
      }),
    });

    const { recordPriceTrackingMetric } = await import("./db");

    await expect(recordPriceTrackingMetric({ productId: 21_120_004, source: "search", outcome: "unmatched", apiCalls: 2, durationMs: 797 }))
      .resolves.toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("21120004"), fkError);
  });
});
