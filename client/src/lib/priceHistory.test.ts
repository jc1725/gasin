import { describe, expect, it } from "vitest";
import { collapsePriceHistoryToDailyLow, getLatestCheckedPrice, getRecentSoldOutObservations, mergeAllPriceHistory, mergePriceHistory } from "./priceHistory";

describe("mergePriceHistory", () => {
  it("sorts official and confirmed prices together in timestamp order", () => {
    const history = mergePriceHistory(
      [{ price: 8820, recordedAt: "2026-08-14T08:07:38.000Z" }],
      [{ id: 1, price: 8540, checkedAt: "2026-08-16T11:05:00.000Z" }]
    );

    expect(history.map(point => point.price)).toEqual([8820, 8540]);
    expect(history.map(point => point.occurredAt.toISOString())).toEqual(["2026-08-14T08:07:38.000Z", "2026-08-16T11:05:00.000Z"]);
  });

  it("removes duplicate values recorded at the same timestamp", () => {
    const history = mergePriceHistory(
      [{ price: 8820, recordedAt: "2026-08-14T08:07:38.000Z" }],
      [{ id: 1, price: 8820, checkedAt: "2026-08-14T08:07:38.000Z" }]
    );

    expect(history).toHaveLength(1);
  });
});

it("uses the lowest confirmed price for the 90-day minimum", () => {
  const history = mergePriceHistory(
    [{ price: 8820, recordedAt: "2026-08-14T08:07:38.000Z" }],
    [
      { id: 1, price: 8540, checkedAt: "2026-08-16T11:05:00.000Z" },
      { id: 2, price: 8520, checkedAt: "2026-08-16T12:05:00.000Z" },
    ]
  );

  expect(Math.min(...history.map(point => point.price))).toBe(8520);
});

it("keeps extension collection prices in chronological history with a distinct source", () => {
  const history = mergeAllPriceHistory(
    [{ price: 8820, recordedAt: "2026-08-14T08:07:38.000Z" }],
    [],
    [{ productId: "90044:1:2", price: 8460, collectedAt: "2026-08-15T08:07:38.000Z" }]
  );

  expect(history.map(point => point.price)).toEqual([8820, 8460]);
  expect(history.map(point => point.source)).toEqual(["gasyn", "extension"]);
});

it("does not collapse same-time identical prices across the gasyn and extension sources", () => {
  const history = mergeAllPriceHistory(
    [{ price: 8820, recordedAt: "2026-08-14T08:07:38.000Z" }],
    [],
    [{ productId: "90044:1:2", price: 8820, collectedAt: "2026-08-14T08:07:38.000Z" }]
  );

  expect(history).toHaveLength(2);
  expect(history.map(point => point.source)).toEqual(["extension", "gasyn"]);
});

it("keeps only the lowest price for the same calendar date regardless of the source", () => {
  const history = mergeAllPriceHistory(
    [{ price: 8820, recordedAt: "2026-08-14T08:07:38.000Z" }],
    [],
    [{ productId: "90044:1:2", price: 8460, collectedAt: "2026-08-14T12:07:38.000Z" }]
  );

  const dailyLowest = collapsePriceHistoryToDailyLow(history);
  expect(dailyLowest).toHaveLength(1);
  expect(dailyLowest[0]?.price).toBe(8460);
});

it("keeps sold-out observations out of the price chart while exposing them for the history card", () => {
  const collected = [
    { productId: "8669576280:29008280283:95936494994", price: 23430, inStock: false, collectedAt: "2026-08-28T05:02:50.000Z", optionName: "245ml × 30캔" },
    { productId: "8669576280:29008280283:95936494994", price: null, inStock: false, collectedAt: "2026-08-28T05:04:50.000Z", optionName: "245ml × 30캔" },
    { productId: "8669576280:29008280283:95936494994", price: 22900, inStock: true, collectedAt: "2026-08-27T05:02:50.000Z" },
  ];

  expect(mergeAllPriceHistory([], [], collected)).toMatchObject([{ price: 22900, source: "extension" }]);
  expect(mergeAllPriceHistory([], [], collected)).toHaveLength(1);
  expect(getRecentSoldOutObservations(collected)).toEqual([
    {
      productId: "8669576280:29008280283:95936494994",
      price: null,
      occurredAt: new Date("2026-08-28T05:04:50.000Z"),
      optionName: "245ml × 30캔",
    },
    {
      productId: "8669576280:29008280283:95936494994",
      price: 23430,
      occurredAt: new Date("2026-08-28T05:02:50.000Z"),
      optionName: "245ml × 30캔",
    },
  ]);
});

it("limits visible sold-out rows to the newest observations", () => {
  const collected = Array.from({ length: 3 }, (_, index) => ({
    productId: "sku",
    price: null,
    inStock: false,
    collectedAt: new Date(`2026-08-${String(28 - index).padStart(2, "0")}T00:00:00.000Z`),
  }));

  expect(getRecentSoldOutObservations(collected, 2)).toHaveLength(2);
  expect(getRecentSoldOutObservations(collected, 2)[0]?.occurredAt).toEqual(new Date("2026-08-28T00:00:00.000Z"));
});

// 2026-10-14: "최근 확인 가격" 카드가 사용자 확인 가격만 봐서, 수집기가 매일 가격을 모으는 상품도
// 8/18 수동 확인 값(8,820원)이 최근 확인으로 보였다.
describe("getLatestCheckedPrice", () => {
  const confirmed = [{ id: 1, price: 8820, checkedAt: new Date("2026-08-18T03:08:00.000Z") }];
  const collect = (price: number | null, day: string, inStock = true) => ({ productId: "sku", price, inStock, collectedAt: new Date(`2026-10-${day}T01:00:00.000Z`) });

  it("수집기 관측이 사용자 확인보다 최근이면 수집기 값을 돌려준다", () => {
    const latest = getLatestCheckedPrice(confirmed, [collect(8900, "12"), collect(8500, "14"), collect(8500, "13")]);
    expect(latest).toEqual({ price: 8500, checkedAt: new Date("2026-10-14T01:00:00.000Z"), source: "collector" });
  });

  it("사용자 확인이 더 최근이면 그 값을 쓰고, 시각이 같으면 사용자 확인을 우선한다", () => {
    expect(getLatestCheckedPrice(confirmed, [{ productId: "sku", price: 9000, collectedAt: new Date("2026-08-01T00:00:00.000Z") }])?.source).toBe("confirmed");
    const same = getLatestCheckedPrice([{ id: 2, price: 8000, checkedAt: new Date("2026-10-14T01:00:00.000Z") }], [collect(8100, "14")]);
    expect(same).toMatchObject({ price: 8000, source: "confirmed" });
  });

  it("품절 관측과 가격 없는 관측은 건너뛴다", () => {
    expect(getLatestCheckedPrice(confirmed, [collect(null, "14"), collect(8500, "13", false)])?.source).toBe("confirmed");
  });

  it("확인 기록이 없으면 null", () => {
    expect(getLatestCheckedPrice([], [])).toBeNull();
  });
});
