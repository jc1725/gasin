import { describe, expect, it } from "vitest";
import { parseUserConfirmedPriceCsv } from "./userConfirmedPriceCsv";

describe("parseUserConfirmedPriceCsv", () => {
  const header = "상품명,옵션명,확인일시,확인 가격,쿠팡 링크,메모";
  const row = '피지오겔 베이비 로션,"400ml, 2개",2026-08-16 18:00,"19,900",https://www.coupang.com/vp/products/6539171735?itemId=21554142389&vendorItemId=88606757411,직접 확인';

  it("parses a user-confirmed price with its exact option SKU", () => {
    const [price] = parseUserConfirmedPriceCsv(`${header}\n${row}\n`);
    expect(price).toMatchObject({
      name: "피지오겔 베이비 로션",
      optionLabel: "400ml, 2개",
      price: 19900,
      externalProductId: "6539171735:21554142389:88606757411",
      note: "직접 확인",
    });
    expect(price.checkedAt.toISOString()).toBe("2026-08-16T09:00:00.000Z");
  });

  it("rejects a link that does not contain an exact item and vendor item ID", () => {
    expect(() => parseUserConfirmedPriceCsv(`${header}\n테스트 상품,,2026-08-16,1000,https://www.coupang.com/vp/products/123456,\n`)).toThrow("productId·itemId·vendorItemId");
  });

  it("accepts exact SKU identifiers in separate columns when the normal URL omits vendorItemId", () => {
    const explicitHeader = "상품명,옵션명,확인일시,확인 가격,쿠팡 링크,productId,itemId,vendorItemId,메모";
    const explicitRow = "비플레인 녹두 클렌징폼,,2026-08-16 19:00,8540,https://www.coupang.com/vp/products/7144144379?itemId=1057466829,7144144379,1057466829,5531594514,직접 확인";
    const [price] = parseUserConfirmedPriceCsv(`${explicitHeader}\n${explicitRow}\n`);
    expect(price).toMatchObject({ externalProductId: "7144144379:1057466829:5531594514", price: 8540 });
  });

  it("allows a Drive template with only a header and ignores the legacy sample row", () => {
    expect(parseUserConfirmedPriceCsv(`${header}\n`, { allowEmpty: true })).toEqual([]);
    expect(parseUserConfirmedPriceCsv(`${header}\n예시 상품,500ml 2개,2026-08-16 20:00,19900,https://www.coupang.com/vp/products/123456?itemId=234567&vendorItemId=345678,직접 확인\n`, { allowEmpty: true })).toEqual([]);
  });
});
