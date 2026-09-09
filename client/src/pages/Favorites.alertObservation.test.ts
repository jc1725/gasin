import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/Favorites.tsx"), "utf8");

describe("찜한 상품 알림 관측 안내", () => {
  it("찜 알림 안내를 이메일 또는 앱 알림 문구로 간결하게 표시한다", () => {
    expect(source).toContain("trpc.favorites.alertObservationStatus.useQuery");
    expect(source).toContain("찜하면 이메일 또는 앱 알림으로 알려드립니다.");
    expect(source).not.toContain("알림은 확장 프로그램이 관측한 와우 회원 적용가만 기준으로 보냅니다");
    expect(source).not.toContain("공식 API 기본가는 표시용이며 알림에 사용하지 않습니다");
  });

  it("관측이 없거나 7일이 지난 상품에는 수집 부족 안내를 표시한다", () => {
    expect(source).toContain("최근 수집이 부족합니다 · 7일이 지난 관측값은 알림에 사용하지 않습니다.");
    expect(source).toContain("확장 프로그램에서 이 상품을 다시 열어 가격을 수집해 주세요.");
    expect(source).toContain("alertObservation?.isFresh");
  });
});
