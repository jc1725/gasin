import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminSource = readFileSync(new URL("./AdminPrices.tsx", import.meta.url), "utf8");
const searchSource = readFileSync(new URL("./SearchProducts.tsx", import.meta.url), "utf8");

describe("administrator product management placement", () => {
  it("removes manual owner-only product registration from the administrator page", () => {
    expect(adminSource).not.toContain("소유자 전용 제품 등록");
    expect(adminSource).not.toContain("manualLinks.add.useMutation");
    expect(adminSource).not.toContain("OWNER PRODUCT REGISTRATION");
  });

  it("does not restore manual product registration to the public search page", () => {
    expect(searchSource).not.toContain("소유자 전용 제품 등록");
    expect(searchSource).not.toContain("manualLinks.add.useMutation");
  });

  it("removes the user-confirmed-price import UI while retaining direct price entry", () => {
    expect(adminSource).not.toContain("사용자 확인 가격 가져오기");
    expect(adminSource).not.toContain("userPrices.importCsv.useMutation");
    expect(adminSource).toContain("확인 가격을 저장했습니다.");
  });

  it("removes the bulk missing-option editor while retaining per-product option saving", () => {
    expect(adminSource).not.toContain("누락 옵션 일괄 수정");
    expect(adminSource).not.toContain("importOptionsCsv.useMutation");
    expect(adminSource).not.toContain("bulk-option-editor");
    expect(adminSource).toContain("옵션·가격 저장");
    expect(adminSource).toContain("saveCombinedProduct");
  });

  it("keeps confirmation status badges and provides a neighboring edit action for every product card", () => {
    expect(adminSource).toContain("confirmation.label");
    expect(adminSource).toContain("toggleOptionEditor(product)");
    expect(adminSource).toContain("옵션·용량·수량 수정");
    expect(adminSource).toContain('"수정"');
  });

  it("starts with the confirmation-needed filter so a saved manual price immediately leaves the input list", () => {
    expect(adminSource).toContain("const [showOnlyNeedsConfirmation, setShowOnlyNeedsConfirmation] = useState(true)");
    expect(adminSource).toContain("utils.adminPrices.listDeferred.invalidate()");
    expect(adminSource).toContain("utils.adminPrices.deferredInputSummary.invalidate()");
  });
});
