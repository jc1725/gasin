import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(process.cwd(), "client/src/pages/AdminPrices.tsx"), "utf8");

// 2026-09-22: "기존 수집된 SKU 이걸 삭제하지않고 자동으로 숨겨줘 => 이관되면 기존내용은
// 숨김 처리하고, 90일 지나면 삭제할것" — isActive: false(SKU 이관·관리자 병합·골드박스
// 탈락) 상품은 "현재 가격 추이 상품" 목록에서 기본적으로 숨기고, 토글로만 다시 볼 수
// 있게 한다. 실제 삭제는 서버의 90일 자동 정리(runRetentionDailySchedule)가 하므로,
// 화면에서는 숨기기만 한다 — 사용자가 명시적으로 "삭제하지않고 숨겨줘"라고 요청함.
describe("현재 가격 추이 — 이관·비활성 상품 기본 숨김 처리", () => {
  it("showHiddenProducts가 false면 isActive: false 상품을 목록에서 제외한다", () => {
    expect(page).toContain("const [showHiddenProducts, setShowHiddenProducts] = useState(false);");
    expect(page).toContain('showHiddenProducts ? (currentPriceProducts.data ?? []) : (currentPriceProducts.data ?? []).filter(product => product.isActive !== false)');
  });

  it('숨김 상품 개수를 보여주는 토글 버튼이 있다', () => {
    expect(page).toContain("const hiddenProductCount = useMemo(() => (currentPriceProducts.data ?? []).filter(product => product.isActive === false).length, [currentPriceProducts.data]);");
    expect(page).toContain('`숨김(이관·비활성) 상품 ${hiddenProductCount}개`');
  });

  it("숨김 상품 카드에 90일 자동 삭제까지 남은 기간을 D-day로 보여준다", () => {
    expect(page).toContain("const PRODUCT_RETENTION_DAYS = 90;");
    expect(page).toContain("const describeDaysUntilAutoDelete = (deactivatedAt: Date | null) => {");
    expect(page).toContain("{product.isActive === false && product.deactivatedAt ? <p");
  });
});
