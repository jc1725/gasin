import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./Favorites.tsx", import.meta.url), "utf8");

describe("favorites target price settings", () => {
  it("loads, saves, and clears per-favorite target prices", () => {
    expect(page).toContain("trpc.favorites.listTargetPrices.useQuery");
    expect(page).toContain("trpc.favorites.setTargetPrice.useMutation");
    expect(page).toContain("targetPrice: null");
  });

  it("shows an approachable mobile target-price control and current-price reached state", () => {
    expect(page).toContain("목표 가격 알림");
    expect(page).toContain("목표 가격 설정");
    expect(page).toContain("hasReachedTarget");
  });

  it("submits a mobile numeric keyboard completion through the target-price form", () => {
    expect(page).toContain("onSubmit={event => { event.preventDefault(); saveTargetPrice(product.id); }}");
    expect(page).toContain('type="submit"');
    expect(page).toContain('"저장 중"');
  });
});
