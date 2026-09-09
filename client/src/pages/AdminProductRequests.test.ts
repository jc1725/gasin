import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./AdminProductRequests.tsx", import.meta.url), "utf8");

describe("admin product requests", () => {
  it("uses admin-only request list and status controls", () => {
    expect(page).toContain("trpc.productRequests.listForAdmin.useQuery");
    expect(page).toContain("trpc.productRequests.updateStatus.useMutation");
    expect(page).toContain("등록 완료");
  });

  it("states the privacy-minimizing request policy", () => {
    expect(page).toContain("사용자 이메일과 IP는 저장하지 않습니다.");
  });
});
