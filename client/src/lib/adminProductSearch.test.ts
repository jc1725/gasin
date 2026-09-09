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
});
