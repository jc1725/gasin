import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminSource = readFileSync(new URL("./AdminPrices.tsx", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("../../../server/routers.ts", import.meta.url), "utf8");

describe("administrator missing-search management", () => {
  it("keeps candidate registration and adds a separately labelled delete action", () => {
    expect(adminSource).toContain("후보 등록");
    expect(adminSource).toContain("deleteMissingSearchItem");
    expect(adminSource).toContain("검색 실패 이력을 삭제했습니다.");
    expect(adminSource).toContain(">삭제</button>");
    expect(adminSource).toContain("중복 검색어 통합");
    expect(adminSource).toContain("mergeDuplicateMissingSearches.mutate()");
  });

  it("shows product and option level failure classification fields", () => {
    expect(adminSource).toContain("item.label");
    expect(adminSource).toContain("item.optionSummary");
    expect(adminSource).toContain("item.reason");
    expect(routerSource).toContain("return listMissingSearchesForAdmin(input?.limit);");
  });

  it("exposes the duplicate merge mutation only through the administrator router", () => {
    expect(routerSource).toContain("mergeDuplicateMissingSearches: adminProcedure");
    expect(routerSource).toContain("mergeDuplicateMissingSearchesForAdmin()");
  });

  it("exposes the deletion mutation only through the administrator router", () => {
    expect(routerSource).toContain("deleteMissingSearch: adminProcedure");
    expect(routerSource).toContain("deleteMissingSearchForAdmin(input.missingSearchId)");
  });
});
