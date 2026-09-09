import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("AdminHotDeals special-offer period controls", () => {
  const source = readFileSync(new URL("./AdminHotDeals.tsx", import.meta.url), "utf8");

  it("lets an administrator enter and edit an optional start and end time", () => {
    expect(source).toContain('field("특가 시작 일시(선택)", "startsAt", "datetime-local")');
    expect(source).toContain('field("특가 종료 일시(선택)", "endsAt", "datetime-local")');
    expect(source).toContain("startsAt: startsAt?.toISOString() ?? null");
    expect(source).toContain("endsAt: endsAt?.toISOString() ?? null");
  });

  it("rejects an end time that is not after the start time and explains public visibility", () => {
    expect(source).toContain("종료 일시는 시작 일시보다 뒤여야 합니다.");
    expect(source).toContain("시작 전 또는 종료 후에는 공개 특가 목록에서 자동으로 숨겨집니다.");
  });
});
