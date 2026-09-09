import { describe, expect, it } from "vitest";
import { ADMIN_CONFIRMATION_WINDOW_MS, filterProductsNeedingConfirmation, getAdminConfirmationStatus } from "./adminConfirmationStatus";

describe("getAdminConfirmationStatus", () => {
  const now = new Date("2026-08-18T12:00:00.000Z");

  it("requires confirmation when there is no manual confirmation price", () => {
    expect(getAdminConfirmationStatus(null, now)).toMatchObject({ needsConfirmation: true, label: "확인 필요" });
  });

  it("marks a price confirmed inside the 48-hour window", () => {
    const checkedAt = new Date(now.getTime() - ADMIN_CONFIRMATION_WINDOW_MS + 1);
    expect(getAdminConfirmationStatus(checkedAt, now)).toMatchObject({ needsConfirmation: false, label: "확인 완료" });
  });

  it("requires confirmation at and after exactly 48 hours", () => {
    const checkedAt = new Date(now.getTime() - ADMIN_CONFIRMATION_WINDOW_MS);
    expect(getAdminConfirmationStatus(checkedAt, now)).toMatchObject({ needsConfirmation: true, label: "확인 필요" });
  });

  it("filters only missing or 48-hour-expired product confirmations", () => {
    const products = [
      { id: 1, confirmedPrice: { checkedAt: new Date(now.getTime() - 1_000) } },
      { id: 2, confirmedPrice: { checkedAt: new Date(now.getTime() - ADMIN_CONFIRMATION_WINDOW_MS) } },
      { id: 3, confirmedPrice: null },
    ];
    expect(filterProductsNeedingConfirmation(products, now).map(product => product.id)).toEqual([2, 3]);
  });
});
