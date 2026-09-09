export const ADMIN_CONFIRMATION_WINDOW_MS = 48 * 60 * 60 * 1000;

export type AdminConfirmationStatus = {
  needsConfirmation: boolean;
  label: "확인 필요" | "확인 완료";
  description: string;
};

/** 최근 관리자 확인 가격을 기준으로 다음 수동 확인 필요 여부를 계산한다. */
export function getAdminConfirmationStatus(checkedAt: Date | null | undefined, now = new Date()): AdminConfirmationStatus {
  if (!checkedAt || Number.isNaN(new Date(checkedAt).getTime())) {
    return { needsConfirmation: true, label: "확인 필요", description: "직접 확인한 가격 기록이 없습니다." };
  }

  const elapsedMs = now.getTime() - new Date(checkedAt).getTime();
  if (elapsedMs >= ADMIN_CONFIRMATION_WINDOW_MS) {
    return { needsConfirmation: true, label: "확인 필요", description: "최근 확인 후 48시간이 지났습니다." };
  }

  return { needsConfirmation: false, label: "확인 완료", description: "최근 확인 후 48시간 이내입니다." };
}

export function filterProductsNeedingConfirmation<T extends { confirmedPrice?: { checkedAt: Date } | null }>(products: T[], now = new Date()) {
  return products.filter(product => getAdminConfirmationStatus(product.confirmedPrice?.checkedAt, now).needsConfirmation);
}
