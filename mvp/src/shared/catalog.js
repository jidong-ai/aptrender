// 체험에 나오는 제품과 예상 금액. 금액은 모두 전시용 예시 값이다(실제 판매가 아님).
// photo = 제품 사진(assets/product/, 사용자 업로드). 카탈로그·XR 제품 카드·상담상세에 쓴다

export const ISLANDS = {
  a: { name: '샤인 E0 렌지대 홈바', brand: '플레이너스', color: '화이트', price: 389000, photo: '/assets/product/island-a.jpg' },
  b: { name: '아떼 원목 아일랜드 식탁', brand: '아떼', color: '마호가니', price: 690000, photo: '/assets/product/island-b.jpg' },
  c: { name: '국내제작 도라 아일랜드 수납식탁', brand: '이홈데코', color: '오크', price: 459000, photo: '/assets/product/island-c.jpg' },
};

export const FLOORS = {
  portland: { name: '진 그란데 스퀘어 포틀랜드 모티프', brand: '동화자연마루', pricePerM2: 62000, swatch: '#cfc6b8' },
  flosso: { name: '진 그란데 스퀘어 플로쏘', brand: '동화자연마루', pricePerM2: 58000, swatch: '#d9d4cb' },
};

// 옵션수정 패널의 색상 칩(Figma 1437:3759). selected = 체험에서 누를 칩
export const FLOOR_CHIPS = ['#e6dccb', '#dac9ac', '#d3b688', '#c69a61', '#c2b183', '#ac9a80', '#97673b', '#6e4626'];
export const FLOOR_CHIP_SELECTED = 1; // Figma 1437:3759에서 선택된 칩(두 번째)

export const ESTIMATE = {
  areaM2: 9.5, // 주방 바닥 면적(예시)
  demolition: 350000, // 기존 바닥 철거비(예시)
  islandInstall: 120000, // 아일랜드 설치비(예시)
};

const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
export { won };

/** 선택({ island, floor }) → 항목별 금액과 합계 */
export function estimate({ island = null, floor = null } = {}) {
  const items = [];
  if (island && ISLANDS[island]) {
    items.push({ key: 'island', label: '아일랜드', name: ISLANDS[island].name, amount: ISLANDS[island].price });
    items.push({ key: 'islandInstall', label: '아일랜드 설치', amount: ESTIMATE.islandInstall });
  }
  if (floor && FLOORS[floor]) {
    const f = FLOORS[floor];
    items.push({ key: 'floor', label: '바닥재', name: f.name, amount: f.pricePerM2 * ESTIMATE.areaM2, formula: `${won(f.pricePerM2)}/㎡ × ${ESTIMATE.areaM2}㎡` });
    items.push({ key: 'demolition', label: '기존 바닥 철거', amount: ESTIMATE.demolition });
  }
  return { items, total: items.reduce((s, i) => s + i.amount, 0) };
}
