import { describe, expect, it } from "vitest";
import { filterAdminProducts } from "./adminProductSearch";

const products = [
  { id: 1, name: "비플레인 클렌징폼", externalProductId: "7144144379:1057466829:5531594514", variantLabel: "80ml × 1개", unitLabel: "10ml" },
  { id: 2, name: "헤드앤숄더 샴푸", externalProductId: "100:200:300", variantLabel: "500ml × 2개", unitLabel: "100ml" },
];

describe("filterAdminProducts", () => {
  it("finds products by name, Coupang SKU, option, or capacity", () => {
    expect(filterAdminProducts(products, "클렌징폼").map(product => product.id)).toEqual([1]);
    expect(filterAdminProducts(products, "1057466829").map(product => product.id)).toEqual([1]);
    expect(filterAdminProducts(products, "500ml").map(product => product.id)).toEqual([2]);
    expect(filterAdminProducts(products, "100ML").map(product => product.id)).toEqual([2]);
  });

  it("returns the full list for an empty or whitespace-only query", () => {
    expect(filterAdminProducts(products, "")).toEqual(products);
    expect(filterAdminProducts(products, "  ")).toEqual(products);
  });

  it("filters missing-option rows even when a Coupang SKU is unavailable", () => {
    const missingOptionProducts = [
      { id: 10, name: "뉴케어 올프로틴 고소한맛", variantLabel: "고소한맛", unitLabel: "200ml" },
      { id: 11, name: "농심 신라면", variantLabel: null, unitLabel: null },
    ];
    expect(filterAdminProducts(missingOptionProducts, "200ml").map(product => product.id)).toEqual([10]);
    expect(filterAdminProducts(missingOptionProducts, "신라면").map(product => product.id)).toEqual([11]);
  });

  // 2026-09-17: "골드박스 상품이 검색이 안 된다"는 문의로 추가됨. 상품명에 우연히
  // "골드박스" 글자가 들어있지 않으면(거의 항상 그렇다) 예전엔 절대 못 찾았다 —
  // products.source 값으로도 찾을 수 있어야 한다.
  it("finds products by their collection source (Korean or English label)", () => {
    // 이름에는 일부러 출처 관련 단어를 전혀 넣지 않는다 — 이름 매칭이 아니라
    // source 필드로만 찾아지는지 검증하기 위함.
    const sourcedProducts = [
      { id: 20, name: "무지개 텀블러 세트", externalProductId: "1:2:3", variantLabel: null, unitLabel: null, source: "goldbox" },
      { id: 21, name: "은색 주방용 칼 세트", externalProductId: "4:5:6", variantLabel: null, unitLabel: null, source: "bestcategory" },
      { id: 22, name: "파란색 무선 이어폰", externalProductId: "7:8:9", variantLabel: null, unitLabel: null, source: "collection" },
      { id: 23, name: "초록색 우산", externalProductId: "10:11:12", variantLabel: null, unitLabel: null, source: "search" },
    ];
    expect(filterAdminProducts(sourcedProducts, "골드박스").map(product => product.id)).toEqual([20]);
    expect(filterAdminProducts(sourcedProducts, "goldbox").map(product => product.id)).toEqual([20]);
    expect(filterAdminProducts(sourcedProducts, "베스트카테고리").map(product => product.id)).toEqual([21]);
    expect(filterAdminProducts(sourcedProducts, "수집기").map(product => product.id)).toEqual([22]);
  });

  it("still ignores source labels when the field is absent (backward compatible)", () => {
    expect(filterAdminProducts(products, "골드박스")).toEqual([]);
  });
});
