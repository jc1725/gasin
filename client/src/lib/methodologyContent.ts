export const METHODOLOGY_URL = "https://gasin.shop/methodology";

export const methodologyFaqs = [
  {
    question: "가신은 가격을 어떤 기준으로 비교하나요?",
    answer: "가신은 상품명만으로 같은 상품이라고 판단하지 않고 productId, itemId, vendorItemId가 일치하는 옵션 SKU를 기준으로 가격을 비교합니다. 용량, 포장 단위, 수량, 색상처럼 선택 구성을 구분해 다른 옵션의 가격이 섞이는 일을 줄입니다. 같은 상품군 안에서도 구성별 가격과 단위당 가격을 따로 확인할 수 있습니다. 구매 전에는 선택한 옵션이 화면의 추적 구성과 같은지 다시 확인하세요.",
  },
  {
    question: "와우회원가는 언제 기준 가격으로 사용하나요?",
    answer: "가신은 수집기가 실제 회원 세션에서 최근 24시간 안에 확인한 와우회원가만 현재 추적 가격에 우선 반영합니다. 관측 시각과 가격이 함께 있어야 하며, 오래된 관측값을 현재 와우회원가로 단정하지 않습니다. 목표가 알림은 최근 7일 안에 수집된 회원 적용가 관측만 기준으로 사용합니다. 최종 결제 가격은 쿠팡에 로그인한 뒤 상품 페이지에서 다시 확인해야 합니다.",
  },
  {
    question: "쿠팡 파트너스 API 가격은 어떤 역할인가요?",
    answer: "쿠팡 파트너스 API의 기본 가격은 상품 정보와 표시용 참고 가격으로 활용합니다. 이 가격만으로 와우회원가나 쿠폰 적용가를 확정하지 않으며, 목표가 알림의 기준으로도 사용하지 않습니다. 회원 적용가가 최근에 관측되면 가신은 그 관측값을 별도로 우선 해석합니다. 가격 차이가 보이면 구매 전에 쿠팡의 선택 옵션과 적용 혜택을 확인하세요.",
  },
  {
    question: "90일 최저가는 어떻게 계산하나요?",
    answer: "가신 상세 화면은 최근 90일 가격 이력을 불러와 날짜별로 기록된 가격 중 가장 낮은 값을 정리합니다. 90일 구간에 가격 기록이 있으면 그 값들 가운데 가장 낮은 금액을 90일 최저가로 표시합니다. 해당 구간의 기록이 없을 때는 저장된 최저가를 안내값으로 보여 줄 수 있으므로 가격 이력의 관측일도 함께 살펴봐야 합니다. 현재가와 90일 최저가를 함께 보고 최종 가격은 구매 직전에 확인하세요.",
  },
  {
    question: "옵션이나 구매 링크가 달라지면 어떻게 하나요?",
    answer: "가신은 최근 관측된 정확한 SKU의 productId, itemId, vendorItemId가 일치할 때만 해당 옵션의 구매 경로를 신뢰합니다. 옵션 ID나 구성이 달라지면 더 저렴해 보이는 다른 옵션으로 자동 이동시키지 않습니다. 확인할 수 없는 경우에는 기존 가격 기록을 다른 SKU에 합치지 않고 쿠팡에서 같은 구성인지 다시 확인하도록 안내합니다. 원하는 구성과 수량이 맞는지 확인한 뒤 가격 추적을 시작하세요.",
  },
] as const;

export function buildMethodologyFaqSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: methodologyFaqs.map(faq => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

export const methodologyWebPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "가신의 가격 검증 방법",
  url: METHODOLOGY_URL,
  inLanguage: "ko-KR",
  description: "가신이 옵션 SKU, 최근 와우회원가 관측, 가격 이력, 구매 경로를 확인하는 가격 검증 방법입니다.",
  about: "쿠팡 상품 가격 검증과 와우회원가 관측 기준",
};
