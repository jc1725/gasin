import { describe, expect, it } from "vitest";
import { getProductMetaTags } from "./productMeta";

describe("getProductMetaTags", () => {
  it("용량과 수량을 별도 태그 값으로 분리한다", () => {
    expect(getProductMetaTags("80ml 1개")).toEqual({ capacity: "80ml", quantity: "1개", packSize: null });
  });

  it("정보가 없는 경우 임의의 값을 만들지 않는다", () => {
    expect(getProductMetaTags("옵션 정보 미제공")).toEqual({ capacity: null, quantity: null, packSize: null });
  });

  it("옵션 정보가 비어 있어도 상품명에 포함된 용량과 수량을 검색 결과 태그로 사용한다", () => {
    expect(getProductMetaTags(null, null, "[비건뷰티] 비플레인 녹두 약산성 클렌징폼, 80ml, 1개")).toEqual({ capacity: "80ml", quantity: "1개", packSize: null });
  });

  it("2단계 옵션의 포장 개입과 실제 구매 수량을 분리한다", () => {
    expect(getProductMetaTags("30개입, 2개")).toEqual({ capacity: null, packSize: "30개입", quantity: "2개" });
  });
});
