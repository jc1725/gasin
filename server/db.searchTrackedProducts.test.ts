import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), select: vi.fn() }));

vi.mock("drizzle-orm/mysql2", async importOriginal => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: mocks.drizzle };
});

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  };
}

describe("searchTrackedProducts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
    mocks.drizzle.mockReturnValue({ select: mocks.select });
  });

  afterEach(() => delete process.env.DATABASE_URL);

  // 실제로 재현된 사고: '팬틴 극손상케어 트리트먼트 220ml' 검색 시, DB에 정확히
  // 일치하는 상품(가신 수집기가 확인한 SKU)이 있었는데도 '트리트먼트'라는 흔한
  // 단어 하나만 겹치는 다른 브랜드 상품들이 더 최근에 갱신되어 있어 넓은 OR
  // 조건 + lastSeenAt DESC LIMIT 안에서 정확히 일치하는 상품이 밀려났다.
  it("모든 핵심 토큰이 일치하는 상품을 흔한 단어 하나만 겹치는 최근 상품보다 우선한다", async () => {
    const exactMatch = { id: 169608916, name: "팬틴 극손상케어 트리트먼트, 220ml, 1개" };
    // 첫 번째 select 호출(모든 토큰 AND)만으로 정확한 상품이 나오면 그걸로 끝나야 하고,
    // '트리트먼트'만 겹치는 넓은 폴백 쿼리(두 번째 select)는 아예 호출되지 않아야 한다.
    mocks.select.mockReturnValueOnce(selectChain([exactMatch]));

    const { searchTrackedProducts } = await import("./db");
    const result = await searchTrackedProducts("팬틴 극손상케어 트리트먼트 220ml", 10);

    expect(result).toEqual([exactMatch]);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("모든 토큰이 겹치는 상품이 없으면 토큰 하나라도 맞는 넓은 후보로 폴백한다", async () => {
    // '촉촉'처럼 검색어에는 있지만 실제 저장된 상품명에는 없는 수식어가 섞이면
    // 모든 토큰 AND 조회는 0건이 되므로, 핵심 상품명 토큰(바디워시)만 겹치는
    // 넓은 폴백으로 정상 상품을 계속 찾을 수 있어야 한다.
    const looseMatch = { id: 1, name: "바디워시 250ml 2개" };
    mocks.select
      .mockReturnValueOnce(selectChain([])) // 1차: 모든 토큰 AND — 없음
      .mockReturnValueOnce(selectChain([looseMatch])); // 2차: 토큰 하나라도 OR — 폴백

    const { searchTrackedProducts } = await import("./db");
    const result = await searchTrackedProducts("바디워시 촉촉 250ml", 10);

    expect(result).toEqual([looseMatch]);
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it("핵심 토큰이 하나뿐이면 곧바로 넓은 OR 조건 한 번만 조회한다", async () => {
    const match = { id: 2, name: "샴푸" };
    mocks.select.mockReturnValueOnce(selectChain([match]));

    const { searchTrackedProducts } = await import("./db");
    const result = await searchTrackedProducts("샴푸", 10);

    expect(result).toEqual([match]);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });
});
