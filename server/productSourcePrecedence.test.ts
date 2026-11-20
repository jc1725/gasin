import { describe, expect, it } from "vitest";
import { resolveUpsertSource } from "./productSourcePrecedence";

describe("upsert 시 상품 소속(source) 유지 규칙", () => {
  it("활성 골드박스 상품은 검색 재확인·카테고리 베스트 결과로 덮어쓰지 않는다", () => {
    expect(resolveUpsertSource({ source: "goldbox", isActive: true }, "search")).toBe("goldbox");
    expect(resolveUpsertSource({ source: "goldbox", isActive: true }, "bestcategory")).toBe("goldbox");
  });

  it("활성 카테고리 베스트 상품은 검색 결과로 덮어쓰지 않지만 오늘 골드박스에 오르면 골드박스가 된다", () => {
    expect(resolveUpsertSource({ source: "bestcategory", isActive: true }, "search")).toBe("bestcategory");
    expect(resolveUpsertSource({ source: "bestcategory", isActive: true }, "goldbox")).toBe("goldbox");
  });

  it("비활성(어제 골드박스에서 내려간) 행과 새 상품은 새 소속을 그대로 받는다", () => {
    expect(resolveUpsertSource({ source: "goldbox", isActive: false }, "search")).toBe("search");
    expect(resolveUpsertSource(undefined, "search")).toBe("search");
  });

  it("검색 상품이 골드박스·카테고리 베스트에 오르면 그 소속으로 바뀐다", () => {
    expect(resolveUpsertSource({ source: "search", isActive: true }, "goldbox")).toBe("goldbox");
    expect(resolveUpsertSource({ source: "search", isActive: true }, "bestcategory")).toBe("bestcategory");
  });
});
