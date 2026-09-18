import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(process.cwd(), "client/src/pages/AdminPrices.tsx"), "utf8");

// 2026-09-18: 쿠팡이 같은 옵션(vendorItemId)의 itemId를 재발급하면, 수집기가 새 itemId로
// 관측을 보내는 순간 이전 행은 isActive: false로 비활성화되고 즐겨찾기·알림 등 사용자
// 연결은 새 행으로 이관된다(supersedeSearchSkusWithCollectorObservation, server/db.ts).
// 그런데 "현재 가격 추이 상품" 검색은 비활성 행도 그대로 보여주고(오히려 가장 오래
// 갱신 안 된 순으로 정렬돼 검색 결과 맨 위에 뜸), 그 행에는 "비활성(만료 감지)" 배지만
// 있고 실제로 최신 데이터가 어느 상품으로 옮겨갔는지 알 방법이 없었다. 사용자가 이
// 비활성 행을 "이 상품"이라고 착각하고 수집기로 갱신해도(실제로는 새 SKU/새 행으로
// 저장됨) 계속 "업데이트 안 됨"으로 보이는 혼란이 있었다. lastRefreshReason에 이미
// "상품 #<새 id>로 사용자 연결 이관" 문구가 저장돼 있으므로, 비활성 행에는 이 사유를
// 그대로 노출해서 사용자가 새 상품으로 옮겨갔다는 걸 바로 알 수 있게 한다.
describe("현재 가격 추이 — 비활성(만료 감지/SKU 대체) 상품에 사유 노출", () => {
  it("isActive가 false이고 lastRefreshReason이 있으면 그 사유 문구를 카드에 표시한다", () => {
    expect(page).toContain("product.isActive === false && product.lastRefreshReason");
    expect(page).toContain("{product.lastRefreshReason}</p>");
  });
});
