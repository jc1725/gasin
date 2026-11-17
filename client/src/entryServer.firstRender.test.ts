import React from "react";
import { describe, expect, it } from "vitest";
import type { SsrPrefetch } from "./ssr/prefetch";

// vitest 설정에는 JSX 자동 런타임이 없어(클래식 런타임) tsx 모듈이 전역 React를 찾는다.
(globalThis as { React?: typeof React }).React = React;
const { render } = await import("./entry-server");

const prefetch: SsrPrefetch = {
  siteStats: async () => ({}),
  homeFeatured: async () => ({ products: [] }),
  listProducts: async () => [],
  hotDeals: async () => [],
  deals: async () => ({ kind: "drops", items: [], generatedAt: new Date(), indexable: false }),
  product: async () => null,
  collectedPriceHistory: async () => [],
  relatedVariants: async () => [],
};

describe("SSR 첫 렌더", () => {
  it("지연 로딩 페이지도 프로세스의 첫 렌더에서 Suspense fallback 없이 본문을 렌더한다", async () => {
    // 이 파일에서 render를 처음 호출하는 테스트라 lazy 모듈이 아직 준비되지 않은 상태다.
    const first = await render("/guide", prefetch);
    expect(first.html).not.toContain("페이지를 불러오는 중");
    expect(first.html).toContain("<h1");
  });

  it("다른 지연 로딩 페이지(/deals/drops)도 같다", async () => {
    const result = await render("/deals/drops", prefetch);
    expect(result.html).not.toContain("페이지를 불러오는 중");
    expect(result.html).toContain("최근 7일 가격이 내린 상품");
  });

  it("홈 서버 렌더링 결과에 목록 페이지 링크가 포함된다", async () => {
    const result = await render("/", prefetch);
    expect(result.html).not.toContain("페이지를 불러오는 중");
    expect(result.html).toContain('href="/deals/drops"');
    expect(result.html).toContain('href="/deals/low"');
  });
});
