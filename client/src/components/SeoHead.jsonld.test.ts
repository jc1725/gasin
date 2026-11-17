import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shouldKeepServerJsonLd } from "./SeoHead";

describe("SeoHead JSON-LD 하이드레이션", () => {
  it("첫 하이드레이션에서 서버 스크립트가 있으면 덮어쓰지 않는다", () => {
    expect(shouldKeepServerJsonLd(true, true, false)).toBe(true);
  });

  it("서버 스크립트가 없거나, 두 번째 이후 실행(경로 변경)이거나, 호출자가 데이터를 직접 넘기면 새로 쓴다", () => {
    expect(shouldKeepServerJsonLd(true, false, false)).toBe(false);
    expect(shouldKeepServerJsonLd(false, true, false)).toBe(false);
    expect(shouldKeepServerJsonLd(true, true, true)).toBe(false);
  });

  it("JSON-LD 이펙트가 이 판단 함수를 실제로 사용한다", () => {
    const source = readFileSync(new URL("./SeoHead.tsx", import.meta.url), "utf8");
    expect(source).toContain("shouldKeepServerJsonLd(isFirstRun");
    expect(source).toContain("hydratedRef");
  });
});
