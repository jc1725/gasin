import { describe, expect, it } from "vitest";
import { describeDeepLinkFailure } from "./deepLinkFailureReason";

describe("describeDeepLinkFailure", () => {
  it("explains an exact SKU miss with a safe collector re-observation action", () => {
    expect(describeDeepLinkFailure("정확 SKU 미확인: 공식 결과 없음")).toMatchObject({
      title: "정확 SKU를 공식 결과에서 찾지 못함",
      action: expect.stringContaining("itemId·vendorItemId"),
    });
  });

  it("distinguishes unsupported source URLs from an empty deep-link API result", () => {
    expect(describeDeepLinkFailure("원본 URL 문제: 지원되지 않음").title).toContain("원본 쿠팡 URL");
    expect(describeDeepLinkFailure("쿠팡 딥링크 생성 결과가 없습니다.").title).toContain("생성 결과 없음");
  });
});
