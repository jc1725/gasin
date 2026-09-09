import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./AdminPrices.tsx", import.meta.url), "utf8");

describe("administrator price refresh queue UI", () => {
  it("requires confirmation and explains the external ten-item batch", () => {
    expect(source).toContain("enqueueAllSearchProductsForPriceRefresh.useMutation");
    expect(source).toContain("전체 가격 재확인 대기열");
    expect(source).toContain("등록 뒤 자동 실행이 설정된 배치 한도에 따라 순차 처리합니다.");
    expect(source).toContain("전체 상품 대기열 등록");
  });

  it("provides a favorites-only collector refresh action", () => {
    expect(source).toContain("enqueueFavoritedProductsForPriceRefresh.useMutation");
    expect(source).toContain("찜한 상품만 수집기 가격 업데이트");
    expect(source).toContain("수집기가 상품 페이지를 직접 방문해야 가격이 갱신되며");
  });
});
