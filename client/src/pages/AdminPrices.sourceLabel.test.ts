import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(process.cwd(), "client/src/pages/AdminPrices.tsx"), "utf8");

// 2026-09-21: "일양약품 액티브 마그네슘 플러스 비타민D... 검색한적도 없는데, 왜
// 수집된거지? 누가 상품등록했음?" — 관리자가 특정 상품이 왜 등록됐는지(검색 방문자의
// 상세보기/찜, 수집기 자동 관측, 골드박스·베스트카테고리 정기 갱신) 저를 거치지 않고
// 화면에서 바로 확인할 수 있도록 "현재 가격 추이 상품" 카드에 출처(source)와 등록일
// (firstSeenAt)을 표시한다. listCurrentPriceProductsForAdmin()(server/db.ts)이
// db.select().from(products)로 전체 컬럼을 반환하므로 source/firstSeenAt은 이미
// 클라이언트에 내려오고 있었고, 화면에 표시만 안 하고 있었다.
describe("현재 가격 추이 — 상품 출처(source)·등록일 표시", () => {
  it("각 상품 카드에 출처 라벨과 등록일을 표시한다", () => {
    expect(page).toContain("출처 {describeProductSource(product.source)} · 등록 {formatDate(product.firstSeenAt)}");
  });

  it("source 값별로 사람이 읽을 수 있는 한글 라벨을 매핑한다", () => {
    expect(page).toContain("const PRODUCT_SOURCE_LABELS: Record<string, string> = {");
    expect(page).toContain('search: "검색 (방문자 상세보기·찜)",');
    expect(page).toContain('collection: "수집기 자동 관측",');
    expect(page).toContain('goldbox: "골드박스 정기 갱신",');
    expect(page).toContain('bestcategory: "베스트카테고리 정기 갱신",');
  });

  it("매핑에 없는 source 값은 원문 그대로 보여준다(라벨 누락 시 조용히 숨기지 않음)", () => {
    expect(page).toContain("PRODUCT_SOURCE_LABELS[source] ?? source");
  });
});
