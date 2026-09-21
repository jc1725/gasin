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
//
// 2026-09-21: "이런건 검색한적도 없는데, 왜 수집된거지? 누가 상품등록했음?" — 활성
// 상품인데도 lastRefreshReason이 있는 경우(예: 수집기 자동 등록/품절 관측 사유)가
// 사용자에게는 보이지 않아, 매번 저에게 물어봐야 했다. 그래서 "isActive가 false일
// 때만" 노출하던 조건을 없애고, lastRefreshReason이 있으면 활성/비활성 관계없이
// 항상 노출하도록 넓혔다. 동시에 상품이 어느 경로(source)로 등록됐는지도 별도 줄로
// 보여준다(아래 productRegistration.test.ts류가 그 라벨 매핑을 검증).
describe("현재 가격 추이 — 사유(lastRefreshReason) 노출 범위 확대", () => {
  it("isActive 여부와 무관하게 lastRefreshReason이 있으면 그 사유 문구를 카드에 표시한다", () => {
    expect(page).toContain("{product.lastRefreshReason ? <p");
    expect(page).toContain("{product.lastRefreshReason}</p>");
    // 예전처럼 비활성 상품으로만 제한하는 조건은 더 이상 없어야 한다.
    expect(page).not.toContain("product.isActive === false && product.lastRefreshReason");
  });
});
