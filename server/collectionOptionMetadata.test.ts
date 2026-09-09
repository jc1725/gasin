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

  it("optionName이 없는 단일 SKU 관측은 정상으로 처리한다", () => {
    expect(isCollectedOptionMetadataCompatible("쿠쿠 W8300 공기청정기", null)).toBe(true);
  });
});
