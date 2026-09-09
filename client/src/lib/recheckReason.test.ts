import { describe, expect, it } from "vitest";
import { describeRecheckReason } from "./recheckReason";

describe("재확인 대기 사유", () => {
  it("정확 SKU 미일치 사유를 수집기 관측 대기로 명확하게 바꾼다", () => {
    expect(describeRecheckReason("승인된 Search API 결과에서 productId·itemId·vendorItemId가 모두 일치하는 옵션 SKU를 찾지 못했습니다.")).toBe("정확 SKU를 찾지 못해 수집기 관측을 기다립니다.");
  });

  it("예산 보호 사유를 간결한 재확인 안내로 바꾼다", () => {
    expect(describeRecheckReason("Search API 시간당 예산 보호를 위해 정기 재검색을 보류합니다.")).toBe("쿠팡 API 호출 예산 보호 후 다음 순번에 재확인합니다.");
  });

  it("사유가 없으면 기본 재확인 안내를 제공한다", () => {
    expect(describeRecheckReason(null)).toBe("최근 가격 확인 시간이 지나 순차 재확인을 기다립니다.");
  });
});
