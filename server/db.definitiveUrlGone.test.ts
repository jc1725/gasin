import { describe, expect, it } from "vitest";
import { DEFINITIVE_URL_GONE_PATTERN } from "./db";

// 2026-09-16: 가신 수집기가 상품 페이지에서 "URL이 사라져서 없는 상품입니다"를 감지해
// 보고하면, deactivateProductsReportedGoneByExtension은 이 패턴에 걸릴 때만 소프트
// 비활성화(isActive: false) 대신 완전 삭제(하드 삭제)한다 — 이 문구는 주소 자체가
// 더 이상 유효하지 않을 때만 뜨는 것으로 보여, 확장의 DOM 휴리스틱 오탐 가능성이 있는
// 다른 "삭제/만료" 문구들보다 더 확정적인 신호이기 때문. 이 판정 기준 자체를 실제
// 정규식으로 검증한다(문자열 리터럴 존재 여부가 아니라).
describe("URL이 사라져서 없는 상품입니다 — 확정적 완전 삭제 판정 패턴", () => {
  it("정확한 문구와 조사·공백 변형을 확정 삭제 대상으로 판정한다", () => {
    expect(DEFINITIVE_URL_GONE_PATTERN.test("URL이 사라져서 없는 상품입니다")).toBe(true);
    expect(DEFINITIVE_URL_GONE_PATTERN.test("해당 URL은 사라져서 없는 상품입니다.")).toBe(true);
    expect(DEFINITIVE_URL_GONE_PATTERN.test("URL 사라져 없는 상품")).toBe(true);
  });

  it("이 문구가 없는 일반적인 '삭제/만료' 안내는 확정 삭제 대상으로 판정하지 않는다(소프트 비활성화 유지)", () => {
    expect(DEFINITIVE_URL_GONE_PATTERN.test("상품을 찾을 수 없습니다. 주소가 잘못 입력되었거나, 판매 종료 또는 중지되어 해당 상품을 찾을 수 없습니다.")).toBe(false);
    expect(DEFINITIVE_URL_GONE_PATTERN.test("존재하지 않는 상품입니다")).toBe(false);
    expect(DEFINITIVE_URL_GONE_PATTERN.test("이 URL은 유효하지 않은 주소입니다.")).toBe(false);
  });
});
