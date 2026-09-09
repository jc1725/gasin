import { describe, expect, it } from "vitest";
import { collapsePriceHistoryToDailyLow, getRecentSoldOutObservations, mergeAllPriceHistory, mergePriceHistory } from "./priceHistory";

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
