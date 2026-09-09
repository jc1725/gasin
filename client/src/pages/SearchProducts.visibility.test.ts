import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./SearchProducts.tsx", import.meta.url), "utf8");

describe("SearchProducts visibility", () => {
  it("keeps the search page free of owner product registration and candidate management UI", () => {
    expect(source).not.toContain("소유자 전용 제품 등록");
    expect(source).not.toContain("내 제품 목록·후보 관리");
    expect(source).not.toContain("관리자 페이지로 이동");
  });

  it("keeps the public product search entry point", () => {
    expect(source).toContain("상품 검색");
    expect(source).toContain("catalog.search.useMutation");
  });

  it("keeps the official API result state concise while retaining the deliberate repeat-search refresh flow", () => {
    expect(source).toContain("const refresh = normalizedKeyword === lastSubmittedKeyword;");
    expect(source).toContain("search.mutate({ keyword: normalizedKeyword, limit: 10, refresh }, {");
    expect(source).toContain("쿠팡 API 호출 완료");
    expect(source).toContain("usedOfficialCoupangApi");
    expect(source).not.toContain("저장된 결과를 먼저 확인하고");
  });

  it("shows an accessible animated latest-price status while searching the official API", () => {
    expect(source).toContain('role="status"');
    expect(source).toContain("최신 가격을 확인하고 있어요");
    expect(source).toContain("저장 가격이 없으면 쿠팡 공식 API로 최신 결과를 조회합니다.");
    expect(source).toContain("motion-reduce:animate-none");
  });

  it("shows a single compact empty-result card without unrelated-result narration or external-search detours", () => {
    expect(source).toContain("검색 결과가 없습니다.");
    expect(source).toContain("상품 추가 요청하기");
    expect(source).not.toContain("쿠팡 공식 API가 이 검색어와 무관한 결과만 반환했습니다.");
    expect(source).not.toContain("hasUnrelatedOfficialResponse");
    expect(source).not.toContain("coupangSearchUrl");
  });

  it("shows a clear retry notice when the per-minute Coupang API limit is reached", () => {
    expect(source).toContain("쿠팡 API 요청이 많습니다.");
    expect(source).toContain("잠시 후 다시 시도해 주세요.");
    expect(source).toContain("이후에 다시 검색할 수 있습니다.");
  });
});
