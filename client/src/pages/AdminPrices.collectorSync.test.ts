import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./AdminPrices.tsx", import.meta.url), "utf8");

describe("AdminPrices collector synchronization", () => {
  it("shows an administrator-only GoldBox immediate refresh action with status feedback", () => {
    expect(source).toContain("trpc.adminPrices.goldBoxSyncStatus.useQuery");
    expect(source).toContain("trpc.adminPrices.refreshGoldBox.useMutation");
    expect(source).toContain("GoldBox 지금 갱신");
    expect(source).toContain("기존 API 보호·분당 호출 제한이 그대로 적용됩니다.");
  });

  it("shows an administrator-only collector sync action in the top management header", () => {
    expect(source).toContain("trpc.adminPrices.collectorSyncStatus.useQuery");
    expect(source).toContain("trpc.adminPrices.syncCollectedPrices.useMutation");
    expect(source).toContain("수집 데이터 동기화");
    expect(source).toContain("외부 수집 이력은 90일 후 자동 정리됩니다.");
  });
});
