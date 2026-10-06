import { describe, expect, it, vi } from "vitest";
import { describeUnusedSearchCleanup, runChunkedDeactivation } from "./unusedSearchCleanup";

// 2026-10-06: 콘솔에서 2만 8천 행을 한 번에 UPDATE했지만 300행만 반영됐다.
// 서버가 작은 묶음으로 나눠 처리하고, 실제로 바뀐 행 수를 정확히 돌려줘야 한다.
describe("runChunkedDeactivation", () => {
  it("대상이 없어질 때까지 묶음 단위로 처리하고 바뀐 행 수를 합산한다", async () => {
    let remaining = Array.from({ length: 5 }, (_, i) => i + 1);
    const selectBatch = vi.fn(async (limit: number) => remaining.slice(0, limit));
    const deactivate = vi.fn(async (ids: number[]) => {
      remaining = remaining.filter(id => !ids.includes(id));
      return ids.length;
    });
    const result = await runChunkedDeactivation({ selectBatch, deactivate }, { batchSize: 2, maxBatches: 10 });
    expect(result).toEqual({ deactivatedCount: 5, batches: 3, reachedEnd: true });
    expect(deactivate).toHaveBeenNthCalledWith(1, [1, 2]);
    expect(deactivate).toHaveBeenNthCalledWith(3, [5]);
  });

  it("한 번에 처리하는 묶음 수를 넘지 않고 남은 대상은 다음 실행으로 넘긴다", async () => {
    let next = 1;
    const selectBatch = vi.fn(async (limit: number) => Array.from({ length: limit }, () => next++));
    const deactivate = vi.fn(async (ids: number[]) => ids.length);
    const result = await runChunkedDeactivation({ selectBatch, deactivate }, { batchSize: 3, maxBatches: 2 });
    expect(result).toEqual({ deactivatedCount: 6, batches: 2, reachedEnd: false });
  });

  it("고른 행이 하나도 바뀌지 않으면 같은 행을 다시 고르며 헛돌지 않는다", async () => {
    const selectBatch = vi.fn(async () => [1, 2]);
    const deactivate = vi.fn(async () => 0);
    const result = await runChunkedDeactivation({ selectBatch, deactivate }, { batchSize: 2, maxBatches: 10 });
    expect(selectBatch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ deactivatedCount: 0, batches: 1, reachedEnd: false });
  });

  it("처음부터 대상이 없으면 아무것도 바꾸지 않는다", async () => {
    const deactivate = vi.fn();
    const result = await runChunkedDeactivation({ selectBatch: async () => [], deactivate });
    expect(deactivate).not.toHaveBeenCalled();
    expect(result).toEqual({ deactivatedCount: 0, batches: 0, reachedEnd: true });
  });
});

describe("describeUnusedSearchCleanup", () => {
  it("남은 대상이 있으면 한 번 더 누르라고 안내한다", () => {
    expect(describeUnusedSearchCleanup({ deactivatedCount: 20000, remainingCount: 7622 })).toContain("7,622개가 남았습니다");
  });
  it("다 끝나면 90일 뒤 자동 삭제를 안내한다", () => {
    expect(describeUnusedSearchCleanup({ deactivatedCount: 7622, remainingCount: 0 })).toContain("90일 뒤 자동 삭제");
  });
});
