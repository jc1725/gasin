import { describe, expect, it } from "vitest";
import { filterStableDeliveryResults, hasFullKeywordMatch, rankSearchResults } from "./searchRelevance";

describe("rankSearchResults", () => {
  it("puts keyword-matching products ahead of unrelated API results while preserving original order on ties", () => {
    const ranked = rankSearchResults("파스키에 초콜릿칩 브리오슈", [
      { name: "그림의빵 저당고단백 우유 크림빵" },
      { name: "파스키에 피치 초코렛칩 브리오슈 6개입" },
      { name: "[로켓프레시] 파스키에 초콜릿칩 브리오슈 6입" },
      { name: "외계인방앗간 소금버터 쌀빵" },
    ]);

    expect(ranked.map(product => product.name)).toEqual([
      "[로켓프레시] 파스키에 초콜릿칩 브리오슈 6입",
      "파스키에 피치 초코렛칩 브리오슈 6개입",
    ]);
  });

  it("keeps only stable delivery products when matching results expose delivery tags", () => {
    const results = filterStableDeliveryResults([
      { name: "베베숲 물티슈 로켓", isRocket: true },
      { name: "베베숲 물티슈 일반배송", isRocket: false, isFreeShipping: false },
      { name: "베베숲 물티슈 무료배송", isFreeShipping: true },
    ]);
    expect(results.map(product => product.name)).toEqual(["베베숲 물티슈 로켓", "베베숲 물티슈 무료배송"]);
  });

  it("falls back to all matching products when no delivery tag is available", () => {
    const products = [{ name: "상품 A" }, { name: "상품 B", isRocket: false, isFreeShipping: false }];
    expect(filterStableDeliveryResults(products)).toEqual(products);
  });

  it("removes the entire list when no product name matches the search text", () => {
    const products = [{ name: "우유 크림빵" }, { name: "소금버터 빵" }];
    expect(rankSearchResults("존재하지않는상품", products)).toEqual([]);
  });

  it("keeps partially matching Coupang results when strict core-token matching would hide every result", () => {
    const ranked = rankSearchResults("아이오페 수분 크림 100ml", [
      { name: "아이오페 슈퍼바이탈 크림 50ml" },
      { name: "라네즈 워터뱅크 크림 50ml" },
    ]);
    expect(ranked.map(product => product.name)).toEqual(["아이오페 슈퍼바이탈 크림 50ml"]);
  });

  it("does not show an unrelated scalp-ampoule result for a Kérastase brand search", () => {
    expect(rankSearchResults("케라스타즈", [
      { name: "테토쿨 댄드랩 두피 앰플 두피쿨링 스케일링 지성두피 케어" },
      { name: "케라스타즈 엘릭서 얼팀 샴푸 250ml" },
    ]).map(product => product.name)).toEqual(["케라스타즈 엘릭서 얼팀 샴푸 250ml"]);
  });

  it("keeps shampoo products but excludes unrelated scalp ampoules for a shampoo search", () => {
    expect(rankSearchResults("샴푸", [
      { name: "테토쿨 댄드랩 두피 앰플 두피쿨링 스케일링" },
      { name: "케라스타즈 엘릭서 얼팀 샴푸 250ml" },
      { name: "아로마티카 로즈마리 스칼프 스케일링 샴푸" },
    ]).map(product => product.name)).toEqual([
      "케라스타즈 엘릭서 얼팀 샴푸 250ml",
      "아로마티카 로즈마리 스칼프 스케일링 샴푸",
    ]);
  });

  it("requires both the brand and product-type token for a multi-word search", () => {
    expect(rankSearchResults("케라스타즈 샴푸", [
      { name: "케라스타즈 엘릭서 얼팀 샴푸 250ml" },
      { name: "케라스타즈 엘릭서 얼팀 헤어 오일" },
      { name: "아로마티카 로즈마리 스칼프 스케일링 샴푸" },
      { name: "코카콜라 오리지널 300ml" },
    ]).map(product => product.name)).toEqual(["케라스타즈 엘릭서 얼팀 샴푸 250ml"]);
  });

  it("keeps 비플레인 폼클렌저 results for a 클렌징폼 search while excluding a different cleanser type", () => {
    expect(rankSearchResults("비플레인 클렌징폼", [
      { name: "비플레인 녹두 약산성 폼클렌저 80ml" },
      { name: "비플레인 녹두 클렌징 오일 200ml" },
    ]).map(product => product.name)).toEqual(["비플레인 녹두 약산성 폼클렌저 80ml"]);
  });

  it("does not show unrelated cream products when an Iope moisturizing-cream search has no strict match", () => {
    expect(rankSearchResults("아이오페 수분 크림", [
      { name: "아이오페 슈퍼바이탈 크림 50ml" },
      { name: "라네즈 수분 크림 50ml" },
      { name: "닥터지 레드 블레미쉬 크림" },
    ]).map(product => product.name)).toEqual(["아이오페 슈퍼바이탈 크림 50ml"]);
  });

  it("matches English brand names returned by the API for a Korean brand search", () => {
    expect(rankSearchResults("비플레인 클렌징폼 80ml", [
      { name: "BEPLAIN 녹두 약산성 폼클렌저 80ml" },
      { name: "라네즈 수분 크림 50ml" },
    ]).map(product => product.name)).toEqual(["BEPLAIN 녹두 약산성 폼클렌저 80ml"]);
  });

  it("matches a common mist typo without admitting an unrelated brand", () => {
    expect(rankSearchResults("에스트라 미스크 120", [
      { name: "AESTURA 아토베리어365 하이드로 에센스 미스트 120ml" },
      { name: "아이오페 수분 크림 50ml" },
    ]).map(product => product.name)).toEqual(["AESTURA 아토베리어365 하이드로 에센스 미스트 120ml"]);
  });

  it("retains the branded 비플레인 80ml cleanser when the API omits part of the option text", () => {
    expect(rankSearchResults("비플레인 클렌징폼 80ml", [
      { name: "비플레인 녹두 약산성 클렌저" },
      { name: "에스트라 아토베리어 크림" },
    ]).map(product => product.name)).toEqual(["비플레인 녹두 약산성 클렌저"]);
  });

  it("ranks the requested 80ml branded cleanser ahead of the same-brand generic cleanser", () => {
    expect(rankSearchResults("비플레인 클렌징폼 80", [
      { name: "비플레인 녹두 약산성 클렌징폼" },
      { name: "비플레인 녹두 약산성 클렌징폼 80ml 1개" },
    ]).map(product => product.name)).toEqual([
      "비플레인 녹두 약산성 클렌징폼 80ml 1개",
      "비플레인 녹두 약산성 클렌징폼",
    ]);
  });

  it("keeps a matching product when long queries include package and option descriptors", () => {
    expect(rankSearchResults("센카 올 클리어 더블 워시 폼 클렌저, 150ml, 2개", [
      { name: "센카 올 클리어 더블 워시 폼 클렌저 150ml" },
      { name: "다른 브랜드 클렌징 폼 150ml" },
    ]).map(product => product.name)).toEqual(["센카 올 클리어 더블 워시 폼 클렌저 150ml"]);
  });

  it("keeps the Head & Shoulders cool menthol 1.2L product for a long Korean option query", () => {
    expect(rankSearchResults("헤드앤숄더 두피 토탈 솔루션 샴푸 쿨 멘솔 1.2L 1개", [
      { name: "헤드앤숄더 두피 토탈솔루션 샴푸 쿨멘톨 1.2L" },
      { name: "헤드앤숄더 클리니컬 스트렝스 샴푸 400ml" },
      { name: "다른 브랜드 두피 토탈솔루션 샴푸 쿨멘톨 1.2L" },
    ]).map(product => product.name)).toEqual(["헤드앤숄더 두피 토탈솔루션 샴푸 쿨멘톨 1.2L"]);
  });

  it("can pre-filter raw Coupang responses that expose productName instead of stored name", () => {
    expect(rankSearchResults("케라스타즈 샴푸", [
      { productName: "케라스타즈 엘릭서 얼팀 샴푸 250ml" },
      { productName: "코카콜라 오리지널 300ml" },
    ]).map(product => product.productName)).toEqual(["케라스타즈 엘릭서 얼팀 샴푸 250ml"]);
  });

  it("prefers an exact option SKU over a duplicated legacy page-only product row", () => {
    const ranked = rankSearchResults("매일우유 무지방", [
      { id: 1, name: "매일우유 무지방 0%, 200ml, 120개", externalProductId: "33414098", variantLabel: "200ml × 120개", currentPrice: 62510 },
      { id: 2, name: "매일우유 무지방 0%, 200ml, 120개", externalProductId: "33414098:8483121623:94983884904", variantLabel: "200ml × 120개", currentPrice: 62510 },
    ]);
    expect(ranked.map(product => product.id)).toEqual([2]);
  });

  it("keeps distinct exact vendor option SKUs even when their display details are the same", () => {
    const ranked = rankSearchResults("매일우유 무지방", [
      { id: 1, name: "매일우유 무지방 0%, 200ml, 120개", externalProductId: "33414098:8483121623:94983884904", variantLabel: "200ml × 120개", currentPrice: 62510 },
      { id: 2, name: "매일우유 무지방 0%, 200ml, 120개", externalProductId: "33414098:8483121623:94983884905", variantLabel: "200ml × 120개", currentPrice: 62510 },
    ]);
    expect(ranked.map(product => product.id)).toEqual([1, 2]);
  });
});

describe("hasFullKeywordMatch", () => {
  // 220ml, 1개 같은 옵션 토큰은 name이 아니라 variantLabel·unitLabel에 담기는 경우가
  // 많다. 옵션까지 포함한 원문 문자열을 그대로 비교하면, 핵심 상품명이 완전히
  // 일치하는 가신 수집기 등록 상품도 매번 불일치로 판정되어 외부 API로 덮어써진다.
  it("옵션 토큰이 상품명에 없어도 핵심 토큰이 전부 일치하면 true를 반환한다", () => {
    expect(hasFullKeywordMatch("팬틴 극손상케어 트리트먼트 220ml 1개", [
      { name: "팬틴 극손상케어 트리트먼트", variantLabel: "220ml" },
    ])).toBe(true);
  });

  it("핵심 토큰 중 하나라도 상품명에 없으면 false를 반환한다", () => {
    expect(hasFullKeywordMatch("팬틴 극손상케어 트리트먼트 220ml 1개", [
      { name: "팬틴 샴푸", variantLabel: "500ml" },
    ])).toBe(false);
  });

  it("검색어에 핵심 토큰이 하나도 없으면 false를 반환한다", () => {
    expect(hasFullKeywordMatch("220ml 1개", [{ name: "팬틴 극손상케어 트리트먼트" }])).toBe(false);
  });

  it("productName 필드만 있는 원본 쿠팡 응답 형태도 확인한다", () => {
    expect(hasFullKeywordMatch("케라스타즈 샴푸", [{ productName: "케라스타즈 엘릭서 얼팀 샴푸 250ml" }])).toBe(true);
  });
});
