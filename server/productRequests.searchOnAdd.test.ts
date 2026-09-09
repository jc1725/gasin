import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../client/src/pages/AdminProductRequests.tsx", import.meta.url), "utf8");

describe("신상품 요청 등록 시 쿠팡 API 검색", () => {
  it("등록 완료 경로가 요청 키워드로 강제 외부 검색을 실행한다", () => {
    expect(router).toContain('if (input.status !== "added") return updateProductRequestStatusForAdmin(input.requestId, input.status);');
    expect(router).toContain('getProductRequestForAdmin(input.requestId)');
    expect(router).toContain('searchCatalogSafely(request.keyword, 10, { forceExternal: true, callType: "product-search" })');
    expect(router).toContain('searchResult.source === "rate_limited"');
    expect(router).toContain('searchResult.products.length === 0');
  });

  it("관리자 버튼과 성공·검색 결과 없음 안내가 API 검색 기준으로 표시된다", () => {
    expect(page).toContain("쿠팡 API 검색 후 등록");
    expect(page).toContain("쿠팡 API 검색 완료");
    expect(page).toContain("쿠팡 API 검색 결과가 없어");
  });
});

