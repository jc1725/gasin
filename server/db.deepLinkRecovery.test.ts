import { describe, expect, it } from "vitest";
import { getDeepLinkStatusAfterExactSkuRefresh } from "./db";

describe("정확 SKU 공식 재확인 후 딥링크 상태", () => {
  it("실패 링크는 새 공식 SKU 응답에서만 재생성 대기로 전환한다", () => {
    expect(getDeepLinkStatusAfterExactSkuRefresh("failed")).toBe("pending");
    expect(getDeepLinkStatusAfterExactSkuRefresh("pending")).toBe("pending");
  });

  it("이미 검증된 링크는 재생성하지 않고 ready 상태를 유지한다", () => {
    expect(getDeepLinkStatusAfterExactSkuRefresh("ready")).toBe("ready");
  });
});
