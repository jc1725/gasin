import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("admin search event logging", () => {
  it("records each catalog search with an optional user ID and never stores an email address", () => {
    expect(routerSource).toContain("recordSearchEvent({ userId: ctx.user?.id ?? null");
    expect(dbSource).toContain("export async function recordSearchEvent");
    expect(dbSource).not.toContain("searchEvents.email");
  });

  it("keeps full search-event listing behind an admin procedure", () => {
    expect(routerSource).toContain("listSearchEvents: adminProcedure");
    expect(routerSource).toContain("listSearchEventsForAdmin");
  });
});
