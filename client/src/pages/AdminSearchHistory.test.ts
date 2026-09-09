import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./AdminSearchHistory.tsx", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("./AdminPrices.tsx", import.meta.url), "utf8");

describe("admin search history page", () => {
  it("uses the admin-only query and avoids displaying user email", () => {
    expect(page).toContain("trpc.adminPrices.listSearchEvents.useQuery");
    expect(page).toContain("isAdminUser(user)");
    expect(page).toContain("사용자 이메일과 IP 주소는 기록하거나 보여주지 않습니다.");
    expect(page).not.toContain("event.email");
  });

  it("links to the history page from administrator price management", () => {
    expect(adminPage).toContain('href="/admin/searches"');
    expect(adminPage).toContain("전체 사용자 검색 기록 보기");
  });
});
