import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./SearchProducts.tsx", import.meta.url), "utf8");

describe("search product request feedback", () => {
  it("offers an explicit product-request action for an empty result", () => {
    expect(page).toContain("검색 결과가 없습니다.");
    expect(page).toContain("상품 추가 요청하기");
    expect(page).toContain("trpc.productRequests.submit.useMutation");
  });

  it("does not collect contact details with the request", () => {
    expect(page).not.toContain('type="email"');
    expect(page).toContain("productRequest.mutate({ keyword: normalizedKeyword })");
  });
});
