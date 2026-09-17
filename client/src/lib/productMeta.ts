export type ProductMetaTags = {
  capacity: string | null;
  quantity: string | null;
  packSize: string | null;
};

function clean(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || null;
}

export function getProductMetaTags(
  variantLabel: string | null | undefined,
  unitLabel?: string | null,
  productName?: string | null,
  structuredQuantity?: number | null,
  structuredPackSize?: string | null,
): ProductMetaTags {
  const source = [clean(variantLabel), clean(productName)].filter((value): value is string => Boolean(value)).join(" · ");
  if (!source) return { capacity: null, quantity: null, packSize: null };

  // 2026-09-17: "YRS-23G"(리코더 모델명) 같은 문자열이 "23g"(23그램)로 오인식되어
  // "용량 23G" 배지가 잘못 붙던 버그를 계기로, server/productVariant.ts의 SIZE_PATTERN과
  // 동일한 방어 장치 두 가지를 적용함: 대문자 "G" 단독 표기는 그램으로 인정하지 않고
  // (소문자 "g"만 인정 — kg/mg/ml/L의 대문자 표기는 계속 허용), 숫자 바로 앞에 하이픈이
  // 붙어있으면(모델명 코드 패턴) 매칭하지 않는다. 기존엔 /i(대소문자 무시) 플래그 때문에
  // "g" 자리에 "G"도 그대로 매칭되고 있었음 — 그 플래그를 없애고 필요한 대문자 표기만
  // 명시적으로 나열.
  const capacityMatch = source.match(/(?<!-)\b\d+(?:\.\d+)?\s?(?:ml|mL|ML|리터|L|l|kg|KG|Kg|mg|MG|Mg|cm|CM|mm|MM|g)\b(?![A-Za-z])/);
  const packSizeMatch = source.match(/(?:^|[\s·,/(])(\d{1,6})\s*(개입|팩입|매입|장입|포입|정입|봉입)(?![가-힣])/i);
  const quantityMatch = source.match(/(?:^|[\s·,/()])(?:수량\s*[:：]?\s*)?(\d+)\s*(?:개|입|팩|세트|매|장|롤|포|정)(?![가-힣])/i);

  return {
    capacity: clean(capacityMatch?.[0]) ?? (unitLabel && /(?:ml|리터|\bL\b|g|kg|mg)/i.test(unitLabel) ? clean(source) : null),
    quantity: structuredQuantity && structuredQuantity > 0 ? `${structuredQuantity}개` : quantityMatch ? `${quantityMatch[1]}개` : null,
    packSize: clean(structuredPackSize) ?? (packSizeMatch ? `${packSizeMatch[1]}${packSizeMatch[2]}` : null),
  };
}
