export function getOptionDisplay(option: { variantLabel: string | null; unitPrice: number | null; unitLabel: string | null }) {
  return {
    label: option.variantLabel ?? "용량·수량 정보 미제공",
    showProductName: option.variantLabel === null,
    unitText: option.unitPrice !== null && option.unitLabel ? `${option.unitLabel}당 ${new Intl.NumberFormat("ko-KR").format(option.unitPrice)}원` : "단위가 정보 미제공",
  };
}
