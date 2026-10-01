import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordGoodViaClick, countGoodViaEventsForUser } = vi.hoisted(() => ({ recordGoodViaClick: vi.fn(), countGoodViaEventsForUser: vi.fn() }));
vi.mock("./db", () => ({ recordGoodViaClick, countGoodViaEventsForUser }));

import { GOOD_VIA_RATE_MAX_PER_WINDOW, GOOD_VIA_RATE_WINDOW_MS, allowGoodViaRecord, getMyGoodViaMonth, kstMonthRange, recordGoodViaFromRequest, resetGoodViaRateLimit, toKstDayKey } from "./goodVia";

const req = (ip: string) => ({ headers: { "x-forwarded-for": `${ip}, 10.0.0.1` }, socket: { remoteAddress: "10.0.0.2" } }) as never;

describe("착한경유 클릭 기록 (리뉴얼 2단계)", () => {
  beforeEach(() => {
    resetGoodViaRateLimit();
    recordGoodViaClick.mockReset();
  });

  it("dayKey는 한국 시간 날짜다", () => {
    expect(toKstDayKey(new Date("2026-09-30T14:59:59Z"))).toBe("2026-09-30");
    expect(toKstDayKey(new Date("2026-09-30T15:00:00Z"))).toBe("2026-10-01");
  });

  it("같은 키는 분당 최대 횟수까지만 허용하고, 창이 지나면 다시 허용한다", () => {
    const start = 1_000_000;
    for (let i = 0; i < GOOD_VIA_RATE_MAX_PER_WINDOW; i += 1) expect(allowGoodViaRecord("ip:1.1.1.1", start)).toBe(true);
    expect(allowGoodViaRecord("ip:1.1.1.1", start + 1)).toBe(false);
    expect(allowGoodViaRecord("ip:2.2.2.2", start + 1)).toBe(true);
    expect(allowGoodViaRecord("ip:1.1.1.1", start + GOOD_VIA_RATE_WINDOW_MS)).toBe(true);
  });

  it("회원은 userId로, 비회원은 IP로 제한하고 IP는 DB에 넘기지 않는다", async () => {
    const now = new Date("2026-10-01T03:00:00Z");
    await expect(recordGoodViaFromRequest({ req: req("3.3.3.3"), userId: 7, productId: 11, source: "product", now })).resolves.toEqual({ recorded: true });
    expect(recordGoodViaClick).toHaveBeenCalledWith({ userId: 7, productId: 11, source: "product", dayKey: "2026-10-01", createdAt: now });
    await recordGoodViaFromRequest({ req: req("3.3.3.3"), userId: null, productId: 11, source: "product", now });
    expect(JSON.stringify(recordGoodViaClick.mock.calls)).not.toContain("3.3.3.3");
  });

  it("DB 오류(마이그레이션 전 등)가 나도 예외를 던지지 않는다", async () => {
    recordGoodViaClick.mockRejectedValueOnce(new Error("Table 'goodViaEvents' doesn't exist"));
    await expect(recordGoodViaFromRequest({ req: req("4.4.4.4"), userId: null, productId: 1, source: "product" })).resolves.toEqual({ recorded: false, reason: "error" });
  });

  it("보존 정리 실패가 retention 작업 전체를 막지 않도록 따로 잡는다", () => {
    const jobs = readFileSync(new URL("./scheduledJobs.ts", import.meta.url), "utf8");
    const body = jobs.slice(jobs.indexOf("export async function removeExpiredPriceHistory"), jobs.indexOf("export async function removeExpiredPriceHistory") + 3000);
    expect(body).toMatch(/try \{\s*const goodViaExpiry[\s\S]*db\.pruneGoodViaEvents\(goodViaExpiry\)[\s\S]*\} catch/);
    expect(body.indexOf("pruneGoodViaEvents")).toBeLessThan(body.indexOf('db.markScheduleCompleted("retention")'));
  });

  it("상품 상세 구매 버튼은 문구를 바꾸지 않고, 클릭 기록·sponsored rel·기부 안내·고지를 붙인다", () => {
    const detail = readFileSync(new URL("../client/src/pages/ProductDetail.tsx", import.meta.url), "utf8");
    expect(detail).toContain("trpc.goodVia.record.useMutation()");
    expect(detail).toContain('rel="sponsored nofollow noopener noreferrer" onClick={() => recordGoodVia.mutate({ productId: product.id })}');
    expect(detail).toContain("쿠팡에서 상품 보기");
    expect(detail).toContain("{GIVE_PROMISE}");
    expect(detail).toContain("{PARTNERS_DISCLOSURE}");
    expect(detail).not.toContain("착한경유로 쿠팡 가기");
  });

  it("나의 착한경유: 이번 달 범위는 한국 시간 기준이고 12월은 다음 해 1월 1일까지다", () => {
    expect(kstMonthRange(new Date("2026-09-30T14:59:59Z"))).toEqual({ month: "2026-09", fromDayKey: "2026-09-01", toDayKey: "2026-10-01" });
    expect(kstMonthRange(new Date("2026-09-30T15:00:00Z"))).toEqual({ month: "2026-10", fromDayKey: "2026-10-01", toDayKey: "2026-11-01" });
    expect(kstMonthRange(new Date("2026-12-15T00:00:00Z"))).toEqual({ month: "2026-12", fromDayKey: "2026-12-01", toDayKey: "2027-01-01" });
  });

  it("나의 착한경유: 본인 userId로만 세고, 조회 실패 시 0회가 아니라 available=false로 알린다", async () => {
    countGoodViaEventsForUser.mockResolvedValueOnce(7);
    await expect(getMyGoodViaMonth(42, new Date("2026-10-01T03:00:00Z"))).resolves.toEqual({ month: "2026-10", moveCount: 7, available: true });
    expect(countGoodViaEventsForUser).toHaveBeenCalledWith(42, "2026-10-01", "2026-11-01");
    countGoodViaEventsForUser.mockRejectedValueOnce(new Error("boom"));
    await expect(getMyGoodViaMonth(42, new Date("2026-10-01T03:00:00Z"))).resolves.toEqual({ month: "2026-10", moveCount: 0, available: false });
  });

  it("나의 착한경유 카드는 /favorites에만 있고 금액을 표시하지 않는다", () => {
    const favorites = readFileSync(new URL("../client/src/pages/Favorites.tsx", import.meta.url), "utf8");
    const card = readFileSync(new URL("../client/src/components/MyGoodViaCard.tsx", import.meta.url), "utf8");
    const home = readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8");
    expect(favorites).toContain("trpc.goodVia.myMonth.useQuery(undefined, { enabled: isGoogleUser })");
    expect(favorites).toContain("<MyGoodViaCard");
    expect(home).not.toContain("MyGoodViaCard");
    expect(card).not.toMatch(/\d+원|기부했|기부금액|기부 금액은 \{/);
  });
});
