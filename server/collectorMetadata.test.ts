import { describe, expect, it } from "vitest";
import { buildCollectorProductMetadata, hasMissingCollectorMetadata } from "./collectorMetadata";

describe("collector product metadata", () => {
  it("promotes a collected 80ml, 1개 option into the tracked product label", () => {
    const metadata = buildCollectorProductMetadata({ optionName: "80ml, 1개", capacityText: "80ml", quantity: 1, packSize: null });
    expect(metadata).toEqual({ variantLabel: "80ml × 1개", quantity: 1 });
    expect(hasMissingCollectorMetadata({ variantLabel: null, quantity: 1, packSize: null }, metadata)).toBe(true);
  });

  it("does not overwrite an existing option label with collector metadata", () => {
    const metadata = buildCollectorProductMetadata({ optionName: "80ml, 1개", capacityText: "80ml", quantity: 1, packSize: null });
    expect(hasMissingCollectorMetadata({ variantLabel: "160ml × 1개", quantity: 1, packSize: null }, metadata)).toBe(false);
  });
});
