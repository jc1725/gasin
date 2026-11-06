import { describe, expect, it } from "vitest";
import { isCollectedOptionMetadataCompatible } from "./db";

describe("수집 옵션 메타데이터 호환성", () => {
  it("다른 제품명 형태의 옵션 텍스트는 같은 SKU라도 차단한다", () => {
    expect(isCollectedOptionMetadataCompatible(
      "퀸센스 인덕션 라면 편수냄비",
      "쿡앤쿡 인덕션 베로나 멀티플렉스 팬, 20cm, 크림아이보리, 1개",
    )).toBe(false);
  });

  it("상품명 없이 구성만 적힌 짧은 옵션은 저장할 수 있다", () => {
    expect(isCollectedOptionMetadataCompatible(
      "퀸센스 인덕션 라면 편수냄비",
      "혼합색상 × 20cm × 1개",
    )).toBe(true);
  });

  it.each(["보증 3년", "케어 서비스 포함", "무이자 할부", "에너지 효율 1등급", "성능 측정 완료", "KC 인증", "특허 기술", "정품 보증", "구성품 안내"])("보증·스펙 소개 문구 '%s'는 옵션으로 저장하지 않는다", optionName => {
    expect(isCollectedOptionMetadataCompatible("쿠쿠 W8300 공기청정기", optionName)).toBe(false);
  });

  it("색상·사이즈를 쉼표·괄호로 나열한 옵션은 문장형으로 오인해 거절하지 않는다", () => {
    expect(isCollectedOptionMetadataCompatible(
      "하이베이비키즈 유아용 파스텔 롱 골지 양말 6종 세트",
      "1호, 베이직(백아이보리, 아이보리, 베이지, 진베이지, 올리브, 진브라운)",
    )).toBe(true);
  });

  it("출판사·저자처럼 짧은 항목이 나열된 도서 옵션도 통과한다", () => {
    expect(isCollectedOptionMetadataCompatible("2026~2027년 디스 이즈 도쿄", "테라, 박설희, 김민정")).toBe(true);
  });

  it("항목 안에 여러 단어로 된 다른 상품명이 섞인 나열은 계속 차단한다", () => {
    expect(isCollectedOptionMetadataCompatible("퀸센스 인덕션 라면 편수냄비", "쿡앤쿡 인덕션 베로나 멀티플렉스 팬, 20cm, 크림아이보리")).toBe(false);
    expect(isCollectedOptionMetadataCompatible("파스키에 브리오슈 초코칩", "[이상복명과] 이상복 경주빵 10개입, 380g, 1박스")).toBe(false);
  });

  it("optionName이 없는 단일 SKU 관측은 정상으로 처리한다", () => {
    expect(isCollectedOptionMetadataCompatible("쿠쿠 W8300 공기청정기", null)).toBe(true);
  });
});
