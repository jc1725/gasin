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

describe("AdminHotDeals image handling", () => {
  const source = readFileSync(new URL("./AdminHotDeals.tsx", import.meta.url), "utf8");
  const publicPage = readFileSync(new URL("./HotDeals.tsx", import.meta.url), "utf8");
  const image = readFileSync(new URL("../components/HotDealImage.tsx", import.meta.url), "utf8");

  it("공개·관리자 화면 모두 깨진 이미지 대신 대체 화면을 쓰고 Referer를 보내지 않는다", () => {
    expect(image).toContain('referrerPolicy="no-referrer"');
    expect(image).toContain("onError");
    expect(publicPage).toContain("<HotDealImage");
    expect(source).toContain("<HotDealImage");
  });

  it("관리자 입력 화면에 이미지 미리보기와 실패 안내가 있다", () => {
    expect(source).toContain("이미지 미리보기");
    expect(source).toContain("이미지 주소 복사");
  });
});
