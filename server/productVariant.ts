export type ProductVariantInfo = {
  variantLabel: string | null;
  unitPrice: number | null;
  unitLabel: string | null;
  quantity: number | null;
};

// 2026-09-17: "야마하 소프라노 리코더 저먼식 YRS-23G" 같은 모델명이 "23G"(23그램)로
// 오인식되어 "100g당 28,478원" 같은 엉뚱한 단가가 표시되던 버그를 계기로 두 가지 방어
// 장치를 추가함.
// 1) 순수 대문자 "G" 단독 표기(예: "23G")는 그램 단위로 인정하지 않는다. 실제 쿠팡
//    상품명에서 그램은 거의 항상 소문자 "g"로 쓰이고, 대문자 "G"는 모델명 접미사
//    (YRS-23G)나 "5G"(이동통신) 등 그램과 무관한 경우가 대부분이라 소문자만 인정해도
//    거의 모든 실제 용량 표기를 놓치지 않는다. (kg/mg/ml/L의 대문자 표기는 실제로도
//    자주 쓰이므로 계속 허용.)
// 2) 숫자 바로 앞에 하이픈이 붙어있으면(예: "YRS-23", "SM-A54") 모델명 코드의 일부일
//    가능성이 높으므로 아예 매칭하지 않는다(음의 lookbehind). 영문자 자체는 lookbehind에서
//    제외했는데, "2X330ml"처럼 배수 표기(영문자 바로 뒤에 용량)가 실제 쿠팡 상품명에
//    흔히 쓰이기 때문에 과도하게 막으면 정상 용량까지 놓칠 수 있음 — 하이픈만으로도
//    신고된 모델명 오탐(YRS-23G 등)은 충분히 막힘.
const SIZE_PATTERN = /(?<!-)(\d+(?:[.,]\d+)?)\s*(ml|mL|ML|L|l|kg|KG|Kg|g)(?![A-Za-z])/g;
// 2026-09-17: "오투 중학 과학 ... 2022개정 교육과정"처럼 "개정판"의 "개"가 수량으로
// 오인식되어("2022개") "1개당 8원" 같은 터무니없는 단가가 표시되던 버그를 계기로,
// 매칭된 단위 글자 바로 뒤에 한글 음절이 더 이어지면(예: "개" 다음에 "정") 그건 진짜
// 수량 표기가 아니라 다른 단어의 일부라고 보고 매칭에서 제외한다("12개월"의 "월" 등도
// 같은 이유로 함께 방지됨). client/src/lib/productMeta.ts의 getProductMetaTags가 이미
// 쓰고 있던 방식과 동일.
const QUANTITY_PATTERN = /(\d+)\s*(개입|개|팩|입|병|캔|봉|박스|세트|롤|매)(?![가-힣])/g;
// "30개입"처럼 한 묶음(포장 단위) 안의 낱개 수를 나타내는 표기. 이 표기가 있으면
// 뒤이어 오는 "2개"는 포장 개수(구매 수량)이지 옵션 규격이 아니므로, 용량 정보
// 없이 수량만으로 variantLabel/quantity를 추정하는 건 오히려 혼동을 준다.
const PACK_UNIT_PATTERN = /\d{1,6}\s*(?:개입|팩입|매입|장입|포입|정입|봉입)/;

export function getProductFamilyKey(name: string) {
  return name
    .toLowerCase()
    .replace(SIZE_PATTERN, " ")
    .replace(QUANTITY_PATTERN, " ")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[×xX]/g, " ")
    .replace(/[,/·|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500) || null;
}

function normalizeNumber(raw: string) {
  return Number(raw.replace(",", "."));
}

function normalizeSize(value: number, unit: string, unitBase: number) {
  const lower = unit.toLowerCase();
  if (lower === "l") return { amount: value * 1000, displayUnit: "L", unitLabel: `${unitBase}ml`, unitBase };
  if (lower === "kg") return { amount: value * 1000, displayUnit: "kg", unitLabel: "100g", unitBase: 100 };
  if (lower === "ml") return { amount: value, displayUnit: "ml", unitLabel: `${unitBase}ml`, unitBase };
  return { amount: value, displayUnit: "g", unitLabel: "100g", unitBase: 100 };
}

export function describeProductVariant(name: string, price: number, categoryName?: string | null): ProductVariantInfo {
  const quantities = Array.from(name.matchAll(QUANTITY_PATTERN));
  const quantityMatch = quantities.at(-1);
  const quantityCount = quantityMatch?.[1] ? Number(quantityMatch[1]) : null;
  const quantityUnit = quantityMatch?.[2] ?? "";

  const sizes = Array.from(name.matchAll(SIZE_PATTERN));
  const size = sizes.at(-1);
  const hasBareQuantitySignal = Boolean(quantityCount) && quantityCount! > 0 && !PACK_UNIT_PATTERN.test(name);

  // 용량(ml/g 등) 표기가 없어도 이름에 "2개"처럼 수량 표기가 있으면 그 값만이라도
  // 살려서 저장한다. 단가는 용량을 모르면 계산할 수 없으므로 null로 둔다.
  if (!size?.[1] || !size[2]) {
    if (!hasBareQuantitySignal) return { variantLabel: null, unitPrice: null, unitLabel: null, quantity: null };
    return { variantLabel: `${quantityCount}${quantityUnit}`, unitPrice: null, unitLabel: null, quantity: quantityCount };
  }

  const beautyProduct = /뷰티|스킨|클렌징|크림|세럼|앰플|향수|선크림|샴푸|바디워시/i.test(`${categoryName ?? ""} ${name}`);
  const normalized = normalizeSize(normalizeNumber(size[1]), size[2], beautyProduct ? 10 : 100);
  if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) {
    if (!hasBareQuantitySignal) return { variantLabel: null, unitPrice: null, unitLabel: null, quantity: null };
    return { variantLabel: `${quantityCount}${quantityUnit}`, unitPrice: null, unitLabel: null, quantity: quantityCount };
  }

  const effectiveQuantity = quantityCount ?? 1;
  const sizeDisplay = `${size[1]}${normalized.displayUnit}`;
  const variantLabel = quantityMatch ? `${sizeDisplay} × ${effectiveQuantity}${quantityUnit}` : sizeDisplay;
  const totalAmount = normalized.amount * effectiveQuantity;

  return {
    variantLabel,
    unitPrice: Math.round((price * normalized.unitBase) / totalAmount),
    unitLabel: normalized.unitLabel,
    quantity: quantityCount,
  };
}
