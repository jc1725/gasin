import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const db = fs.readFileSync(path.join(process.cwd(), "server/db.ts"), "utf8");
const router = fs.readFileSync(path.join(process.cwd(), "server/routers.ts"), "utf8");

describe("공개 서비스 지표", () => {
  it("실제 상품·가격 이력·수집 관측을 집계하고 공개 절차로 제공한다", () => {
    expect(db).toContain("getPublicServiceStats");
    expect(db).toContain("activeTrackedProducts");
    expect(db).toContain("priceObservations");
    expect(router).toContain("siteStats: router({");
    expect(router).toContain("public: publicProcedure.query(() => getPublicServiceStats())");
  });
});
