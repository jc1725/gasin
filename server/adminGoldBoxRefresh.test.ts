import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("administrator GoldBox immediate refresh", () => {
  it("allows only the existing administrator procedure to invoke the protected GoldBox collection path", () => {
    expect(router).toContain("goldBoxSyncStatus: adminProcedure");
    expect(router).toContain("refreshGoldBox: adminProcedure.mutation");
    expect(router).toContain("return collectGoldBoxProducts()");
    expect(router).toContain("requireGoogleUser(ctx.user.loginMethod)");
  });
});
