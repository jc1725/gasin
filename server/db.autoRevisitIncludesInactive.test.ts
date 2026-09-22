import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");

// 2026-09-16: 자동 순회(백그라운드 재방문) 후보 선정이 원래 isActive: true인 상품만
// 대상으로 삼았다. 그런데 확장의 "삭제된 상품 보고 → 완전 삭제" 기능이 생긴 뒤에도,
// isActive: false로 비활성화된 상품은 애초에 후보에서 빠지니 확장이 다시 방문할 일이
// 없어서 영원히 "비활성(만료 감지)" 상태로만 남는 문제가 있었다. 이제 삭제가
// 되돌릴 수 없는 완전 삭제이므로, 비활성 상품도 후보에 포함시켜 자동 순회가 다시
// 방문하게 한다 — 실제로 사라진 상품이면 완전 삭제되고, 아직 살아있으면 정상
// 관측이 쌓이며 활성 상태로 돌아온다.
describe("가신 수집기 자동 순회 후보 — isActive 상태와 무관하게 포함", () => {
  it("getStaleTrackedProductsForExtensionRevisit이 더 이상 isActive: true로 후보를 제한하지 않는다", () => {
    const fnStart = db.indexOf("export async function getStaleTrackedProductsForExtensionRevisit");
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = db.indexOf("\n}", fnStart);
    const fnBody = db.slice(fnStart, fnEnd);

    expect(fnBody).toContain("lt(products.lastSeenAt, staleBefore)");
    expect(fnBody).not.toContain("eq(products.isActive, true)");
  });
});

// 2026-09-18: 원래 collection·goldbox·bestcategory 세 소스만 대상이었는데, 전체
// 14,083개 상품 중 이 세 소스가 302개뿐이라 나머지 98%(search 소스, 최대 16일+
// 미확인 상품 다수 포함)가 자동 순회 대상에서 아예 빠져 있었다. 그 결과 "가장
// 오래 확인 안 된 상품부터" 방문한다는 설명과 달리, 전체 상품 기준으로 보면
// 방문 순서가 뒤죽박죽으로 보이는 문제가 있었다(사용자 제보). 소스 제한을
// 없애고 전체 상품을 통틀어 lastSeenAt 오름차순으로 후보를 내도록 변경.
describe("가신 수집기 자동 순회 후보 — 소스 제한 없이 전체 상품 대상", () => {
  it("getStaleTrackedProductsForExtensionRevisit이 더 이상 source로 후보를 제한하지 않는다(전체 상품 대상)", () => {
    const fnStart = db.indexOf("export async function getStaleTrackedProductsForExtensionRevisit");
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = db.indexOf("\n}", fnStart);
    const fnBody = db.slice(fnStart, fnEnd);

    expect(fnBody).not.toContain("inArray(products.source");
    expect(fnBody).not.toContain("EXTENSION_AUTO_REVISIT_SOURCES");
    expect(fnBody).toContain("lt(products.lastSeenAt, staleBefore)");
  });
});

// 2026-09-22: 가신이 직접 조립한 쿠팡 상품 주소(affiliateUrl)로 방문하면서 쿠팡
// 계정 접속이 막혔다. 수집기는 이제 쿠팡 파트너스 딥링크로만 접속하고, 딥링크가
// 아직 없는 상품은 생성될 때까지 후보에서 제외한다.
describe("가신 수집기 자동 순회 후보 — 쿠팡 딥링크로만 방문", () => {
  const fnStart = db.indexOf("export async function getStaleTrackedProductsForExtensionRevisit");
  const fnBody = db.slice(fnStart, db.indexOf("\n}", fnStart));

  it("방문 URL은 affiliateUrl이 아니라 deepLinkUrl이다", () => {
    expect(fnBody).toContain("url: products.deepLinkUrl");
    expect(fnBody).not.toContain("url: products.affiliateUrl");
  });

  it("딥링크가 준비된(link.coupang.com) 상품만 후보로 낸다", () => {
    expect(fnBody).toContain('eq(products.deepLinkStatus, "ready")');
    expect(fnBody).toContain('like(products.deepLinkUrl, "https://link.coupang.com/%")');
  });
});
