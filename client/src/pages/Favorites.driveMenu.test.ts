import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Favorites.tsx", import.meta.url), "utf8");

describe("찜한상품 Google Drive 메뉴", () => {
  it("Google Drive 백업 카드와 연결 상태 조회를 표시하지 않는다", () => {
    expect(source).not.toContain("Google Drive 상품 백업");
    expect(source).not.toContain("Google Drive 연결");
    expect(source).not.toContain("trpc.drive.status.useQuery");
  });

  it("찜한상품의 목표가 알림 기능은 유지한다", () => {
    expect(source).toContain("trpc.favorites.listTargetPrices.useQuery");
    expect(source).toContain("trpc.favorites.alertObservationStatus.useQuery");
  });

  // 2026-09-16: 찜한상품 카드의 "직접 확인 8,540원 · 8.16" 배지를 없앴다 — 조회와
  // ProductCard로의 prop 전달을 모두 제거했다(ProductCard 자체 기능은 그대로 둠).
  it("찜한상품 카드에는 관리자 직접 확인 가격 배지를 표시하지 않는다", () => {
    expect(source).not.toContain("trpc.userPrices.listLatestForFavorites.useQuery");
    expect(source).not.toContain("userConfirmedPrice=");
  });
});
