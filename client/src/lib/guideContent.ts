export const GUIDE_URL = "https://gasin.shop/guide";

export const snsShareCopy = {
  headline: "가격을 있는 그대로 믿지 마세요. 가신이 대신 해독합니다.",
  description: "와우회원가, 할인율, 옵션별 가격 이력까지 비교해 진짜 가격 흐름을 확인하세요.",
} as const;

export const guideFaqs = [
  {
    question: "쿠팡 와우회원가 최저가, 언제 확인해야 할까?",
    answer: "쿠팡 와우회원가는 결제 직전에 다시 확인하는 것이 가장 안전합니다. 와우 할인가는 회원 자격, 선택 옵션, 쿠폰과 시점에 따라 일반가와 다를 수 있습니다. 가신은 최근 수집된 회원 적용가와 가격 흐름을 함께 보여 주지만, 최종 구매 가격은 쿠팡 상품 페이지에서 확인해야 합니다. 관심 상품은 찜하고 목표가를 설정하면 최근 관측가가 목표가 이하일 때 알림을 받을 수 있습니다.",
  },
  {
    question: "쿠팡에서 같은 상품 더 싸게 사는 법",
    answer: "같은 상품을 비교할 때는 상품명만 보지 말고 용량, 수량, 색상과 옵션 SKU가 같은지 먼저 확인해야 합니다. 가신은 저장된 옵션·용량·수량을 검색어와 구매 경로에 함께 반영해 다른 구성 상품과의 혼동을 줄입니다. 100ml당·개당 가격도 함께 비교하면 대용량이나 묶음 상품의 실제 가격 차이를 더 쉽게 판단할 수 있습니다. 가격은 주문 직전에 쿠팡에서 최종 확인해야 합니다.",
  },
  {
    question: "쿠팡 가격 변동 알림 받는 방법",
    answer: "가신에서 상품을 찜하고 원하는 목표 가격을 설정하면 최근 수집 관측가가 목표가 이하일 때 알림을 받을 수 있습니다. 이메일은 찜할 때 동의한 계정으로 발송되며, 휴대폰 알림은 브라우저 또는 설치한 앱에서 권한을 허용하고 푸시 구독을 연결해야 합니다. 같은 목표가 알림은 24시간 기준으로 한 번만 발송하도록 관리합니다. 수집기 관측이 오래된 상품은 최신 가격 미확인으로 표시될 수 있습니다.",
  },
  {
    question: "와우회원가와 일반가는 왜 다를까?",
    answer: "와우회원가는 쿠팡 와우 멤버십 대상에게 적용되는 별도 혜택 가격이어서 일반가와 다를 수 있습니다. 선택한 옵션, 판매자, 로켓배송 조건과 쿠폰 적용 여부도 가격 차이에 영향을 줍니다. 쿠팡 파트너스 검색 결과의 기본 가격만으로 와우회원가를 확정할 수 없기 때문에, 가신은 최근 수집기가 관측한 회원 적용가를 별도로 구분해 활용합니다. 실제 적용 가격은 로그인한 쿠팡 화면에서 다시 확인해야 합니다.",
  },
  {
    question: "쿠팡 가격, 왜 항상 똑같이 저렴해 보이지 않을까?",
    answer: "쿠팡 가격은 할인율만으로 저렴한지 판단하기 어렵기 때문에 옵션, 수량, 회원 혜택과 가격 이력을 함께 봐야 합니다. 프라이스 디코딩은 소비자가 표시 가격을 그대로 믿기보다 가격의 근거와 흐름을 살피는 관점입니다. 원가나 마진을 소비자가 직접 확인하기는 어렵지만, 가신은 같은 옵션의 가격 기록과 최근 와우회원가 관측을 비교해 판단을 돕습니다. 최종 구매 전에는 선택한 옵션과 적용 가격을 쿠팡에서 다시 확인해야 합니다.",
  },
] as const;

export function buildGuideFaqSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: guideFaqs.map(faq => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

export const siteOrganizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "가신",
  url: "https://gasin.shop",
  logo: "https://gasin.shop/manus-storage/gasyn-text-shortcut-icon-preview_1bf92205.png",
  description: "쿠팡 상품의 가격 흐름과 최근 수집 관측가를 비교해 가격을 해독하는 가격 추적 서비스",
};

export const siteWebApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "가신",
  url: "https://gasin.shop",
  applicationCategory: "ShoppingApplication",
  operatingSystem: "Web",
  description: "쿠팡 상품의 옵션별 가격 흐름과 와우회원가 관측을 비교해 가격 판단을 돕는 가격 추적 도구",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "KRW",
  },
};
