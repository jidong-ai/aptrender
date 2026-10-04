// 체험 장면 정의: 시점(spot) × 아일랜드(island) × 바닥재(floor)
// 파노라마 한 장 = 이 셋의 조합 하나. 이름·자리·시선 목표는 여기서만 고친다.

export const SPOTS = ['v1', 'v2']; // 렌더한 시점만. 시점을 늘리면 여기와 SPOT_INFO에 추가
export const ISLANDS = ['none', '1', '2', '3'];
export const FLOORS = ['base', 'a', 'b', 'c'];

// targets: 이 시점에서 아일랜드·바닥이 보이는 방향(yaw·pitch, 도).
// 변경이 생기면 XR 화면이 이 방향으로 천천히 고개를 돌린다. 렌더가 나오면 실제 위치에 맞게 조정.
export const SPOT_INFO = {
  v1: { name: '정면', targets: { island: { yaw: 0, pitch: -15 }, floor: { yaw: 0, pitch: -35 } } },
  v2: { name: '측면', targets: { island: { yaw: 0, pitch: -15 }, floor: { yaw: 0, pitch: -35 } } },
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

// 파일 이름 규칙: {spot}_island{0-3}_floor{0|a|b|c}[_{4k|8k}].jpg  (island0 = 없음, floor0 = 기존 바닥)
// 예: v1_island0_floor0.jpg, v2_island2_floorb_8k.jpg. 크기를 안 붙이면 8K로 본다. 대소문자·확장자(jpg/png/webp) 무관
const FILE = /^(v[1-9])_island([0-3])_floor([0abc])$/i;

// D5에서 뽑은 이름 그대로 쓰는 파일. 이름 → 장면. 새 렌더를 이 방식으로 추가해도 된다
export const ALIASES = {
  pano_front: 'v1_none_base', // 정면 · 옵션 적용 전
  pano_side: 'v2_none_base', // 측면 · 옵션 적용 전
  island_a: 'v2_2_base', // 측면 · 아일랜드 배치(시나리오의 '아일랜드 2') · 바닥재 변경 전
};

const NAME = /^(.+?)(?:_(4k|8k))?\.(jpe?g|png|webp)$/i;

export function parsePanoFile(file) {
  const m = NAME.exec(file);
  if (!m) return null;
  const size = (m[2] ?? '8k').toLowerCase();
  const base = m[1].toLowerCase();
  if (ALIASES[base]) return { key: ALIASES[base], size };
  const f = FILE.exec(base);
  if (!f || !SPOTS.includes(f[1])) return null;
  const island = f[2] === '0' ? 'none' : f[2];
  const floor = f[3] === '0' ? 'base' : f[3];
  return { key: sceneKey(f[1], island, floor), size };
}

/** 장면 설명 문구. 예: "V2 아일랜드 앞 · 아일랜드 2 · 바닥재 B" */
export const describeScene = (spot, island, floor) =>
  `${spot.toUpperCase()} ${SPOT_INFO[spot].name} · ${island === 'none' ? '아일랜드 없음' : ISLAND_INFO[island].name} · ${FLOOR_INFO[floor].name}`;
