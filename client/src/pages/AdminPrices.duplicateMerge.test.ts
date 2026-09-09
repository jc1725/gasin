import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./AdminPrices.tsx", import.meta.url), "utf8");

describe("administrator duplicate product merge UI", () => {
  it("shows the candidate comparison, preview counts, and an explicit merge confirmation", () => {
    expect(page).toContain("중복 상품 후보");
    expect(page).toContain("병합 미리보기");
    expect(page).toContain("이 내용으로 수동 병합");
    expect(page).toContain("가격 이력 이관");
    expect(page).toContain("찜 설정 이관·결합");
    expect(page).toContain("window.confirm");
  });
});
