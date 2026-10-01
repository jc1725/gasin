import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = readFileSync(join(process.cwd(), "server/db.ts"), "utf8");
const routes = readFileSync(join(process.cwd(), "server/collectionRoutes.ts"), "utf8");

// 2026-10-01: 가격 갱신 대상을 "로켓 계열이거나 찜한 상품"으로 한정하면서, 수집기가 상품
// 페이지의 배송 배지(로켓배송·로켓프레쉬·판매자로켓·로켓직구)를 읽어 보내도록 했다.
// 수집기 경로는 그전까지 isRocket을 항상 false로 저장해서, 수집기 상품은 로켓이어도
// 찜하지 않으면 갱신에서 빠졌다.
describe("수집기가 보낸 로켓 배지", () => {
  it("수집 스키마가 선택 필드 isRocket을 받는다(이전 버전 확장도 그대로 동작)", () => {
    expect(routes).toMatch(/isRocket:\s*z\.boolean\(\)\.optional\(\)/);
    // .strict()라서 선언하지 않으면 새 필드를 보낸 배치가 통째로 400이 된다.
    expect(routes).toContain(".strict()");
  });

  it("신규 수집 상품은 수집기가 확인한 값으로 저장하고 기본값은 false다", () => {
    expect(db).toContain("isRocket: item.isRocket === true,");
    expect(db).not.toMatch(/source: "collection",\s*isRocket: false,/);
  });

  it("기존 상품·레거시 승격은 로켓을 확인했을 때만 true로 올리고 되돌리지 않는다", () => {
    const upgrades = db.match(/\.\.\.\(item\.isRocket === true \? \{ isRocket: true \} : \{\}\),/g) ?? [];
    expect(upgrades).toHaveLength(2);
    // false를 받아 덮어쓰는 경로가 없어야 한다(배지가 렌더링 중이라 못 읽은 경우 보호).
    expect(db).not.toMatch(/isRocket:\s*item\.isRocket\s*[,}]/);
  });

  it("API 갱신이 한 번 true가 된 값을 false로 되돌리지 않는다", () => {
    expect(db).toContain("isRocket: sql`(${products.isRocket} OR ${values.isRocket})`");
    expect(db).not.toMatch(/isRocket:\s*values\.isRocket,/);
  });
});
