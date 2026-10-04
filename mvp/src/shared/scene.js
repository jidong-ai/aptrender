// 체험 장면 정의: 시점(spot) × 아일랜드(island) × 바닥재(floor)
// 파노라마 한 장 = 이 셋의 조합 하나. 이름·자리·시선 목표는 여기서만 고친다.

export const SPOTS = ['v1', 'v2', 'v3'];
export const ISLANDS = ['none', '1', '2', '3'];
export const FLOORS = ['base', 'a', 'b', 'c'];

// targets: 이 시점에서 아일랜드·바닥이 보이는 방향(yaw·pitch, 도).
// 변경이 생기면 XR 화면이 이 방향으로 천천히 고개를 돌린다. 렌더가 나오면 실제 위치에 맞게 조정.
export const SPOT_INFO = {
  v1: { name: '전체', targets: { island: { yaw: 0, pitch: -8 }, floor: { yaw: 0, pitch: -30 } } },
  v2: { name: '아일랜드 앞', targets: { island: { yaw: 0, pitch: -25 }, floor: { yaw: 0, pitch: -45 } } },
  v3: { name: '아일랜드 옆', targets: { island: { yaw: 0, pitch: -20 }, floor: { yaw: 0, pitch: -45 } } },
};

export const ISLAND_INFO = {
  none: { name: '없음' },
  1: { name: '아일랜드 1' },
  2: { name: '아일랜드 2' },
  3: { name: '아일랜드 3' },
};

export const FLOOR_INFO = {
  base: { name: '기존 바닥' },
  a: { name: '바닥재 A' },
  b: { name: '바닥재 B' },
  c: { name: '바닥재 C' },
};

export const sceneKey = (spot, island, floor) => `${spot}_${island}_${floor}`;

// 파일 이름 규칙: {spot}_island{0-3}_floor{0|a|b|c}_{4k|8k}.jpg  (island0 = 없음, floor0 = 기존 바닥)
// 예: v1_island0_floor0_8k.jpg, v2_island2_floorb_4k.jpg. 대소문자·확장자(jpg/png/webp) 무관
const FILE = /^(v[1-3])_island([0-3])_floor([0abc])_(4k|8k)\.(jpe?g|png|webp)$/i;
// D2에 올린 화이트 매스 테스트 렌더는 임시로 'V1 · 아일랜드 없음 · 기존 바닥'으로 쓴다
const LEGACY = /^white_day_(4k|8k)\.(jpe?g|png|webp)$/i;

export function parsePanoFile(file) {
  const m = FILE.exec(file);
  if (m) {
    const island = m[2] === '0' ? 'none' : m[2];
    const floor = m[3].toLowerCase() === '0' ? 'base' : m[3].toLowerCase();
    return { key: sceneKey(m[1].toLowerCase(), island, floor), size: m[4].toLowerCase() };
  }
  const legacy = LEGACY.exec(file);
  if (legacy) return { key: sceneKey('v1', 'none', 'base'), size: legacy[1].toLowerCase(), legacy: true };
  return null;
}

/** 장면 설명 문구. 예: "V2 아일랜드 앞 · 아일랜드 2 · 바닥재 B" */
export const describeScene = (spot, island, floor) =>
  `${spot.toUpperCase()} ${SPOT_INFO[spot].name} · ${island === 'none' ? '아일랜드 없음' : ISLAND_INFO[island].name} · ${FLOOR_INFO[floor].name}`;
