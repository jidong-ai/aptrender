// 장면 정의: 배경 파노라마(장면 ID) + 그 위에 겹치는 누끼 레이어(아일랜드·바닥재).
// 파일 이름 = 장면/레이어 ID. 이름·자리·좌표는 여기서만 고친다.

// 배경 파노라마. 같은 공간의 렌더는 카메라를 움직이지 않는다(누끼가 제자리에 겹쳐야 하므로)
export const PANOS = {
  store_1: { name: '위브 매장 1' },
  store_2: { name: '위브 매장 2' },
  counsel: { name: '상담실' },
  kitchen_front: { name: '주방 정면', view: 'front' },
  kitchen_side: { name: '주방 측면', view: 'side' },
};

// 누끼 레이어. pano = 이 레이어가 겹쳐지는 배경. 바닥재는 아일랜드 없이 렌더한다(바닥 → 아일랜드 순으로 겹침)
export const LAYERS = {
  island_a_front: { kind: 'island', option: 'a', pano: 'kitchen_front' },
  island_b_front: { kind: 'island', option: 'b', pano: 'kitchen_front' },
  island_c_front: { kind: 'island', option: 'c', pano: 'kitchen_front' },
  island_a_side: { kind: 'island', option: 'a', pano: 'kitchen_side' }, // 예전 island_a 렌더(시나리오에는 안 씀)
  island_b_side: { kind: 'island', option: 'b', pano: 'kitchen_side' },
  floor_portland_front: { kind: 'floor', option: 'portland', pano: 'kitchen_front' },
  floor_flosso_front: { kind: 'floor', option: 'flosso', pano: 'kitchen_front' },
};

export const ISLAND_OPTIONS = ['a', 'b', 'c'];
export const FLOOR_OPTIONS = ['portland', 'flosso'];

// D5에서 뽑은 예전 이름 → ID
export const ALIASES = {
  pano_front: 'kitchen_front',
  pano_side: 'kitchen_side',
  island_a: 'island_a_side',
};

/** 장면 { pano, island, floor }에 필요한 레이어 ID. 그 시점용 레이어가 정의돼 있지 않으면 null */
export function layerIdFor(pano, kind, option) {
  if (!option) return null;
  const view = PANOS[pano]?.view;
  const id = view && `${kind}_${option}_${view}`;
  return id && LAYERS[id] ? id : null;
}

// 이름 규칙: {ID}[_cut][_4k|_8k].{jpg|png|webp}. 크기를 안 붙이면 8K. 대소문자 무관
//   예: kitchen_front.jpg, island_b_front_cut.png, store_1_4k.jpg
const NAME = /^(.+?)(_cut)?(?:_(4k|8k))?\.(jpe?g|png|webp)$/i;

export function parsePanoFile(file) {
  const m = NAME.exec(file);
  if (!m) return null;
  const base = m[1].toLowerCase();
  const id = ALIASES[base] ?? base;
  if (!PANOS[id] && !LAYERS[id]) return null;
  const size = (m[3] ?? '8k').toLowerCase();
  return m[2] ? { id, size, cut: true } : { id, size };
}

// ---------- 공간 위 좌표(yaw·pitch, 도) ----------
// yaw 0 = 이미지 가로 중앙, +는 오른쪽. pitch +는 위. 렌더가 오면 태블릿 HUD의 좌표 표시로 재서 바꾼다(임시값)
export const ANCHORS = {
  store_1: { hotspot: { yaw: 8, pitch: -22, to: 'store_2', label: '안쪽으로' } },
  store_2: { hotspot: { yaw: -20, pitch: -22, to: 'counsel', label: '상담실로' } },
  counsel: {},
  kitchen_front: {
    island: { yaw: 0, pitch: -16 },
    floor: { yaw: 0, pitch: -42 },
    // 싱크대 앞 → 900mm 떨어진 아일랜드 자리
    dimension: { from: { yaw: -18, pitch: -28 }, to: { yaw: 2, pitch: -28 }, label: '900mm' },
    // 따라 그릴 체크 표시(점선). 900mm 지점 위
    check: [
      [-2.5, -21],
      [0, -24],
      [5, -17],
    ],
  },
  kitchen_side: {
    island: { yaw: 0, pitch: -16 },
    floor: { yaw: 0, pitch: -42 },
  },
};

// 렌더가 없을 때 와이어프레임 레이어를 그릴 자리(이미지 기준 0~1 사각형)
export const PLACEHOLDER_RECT = {
  island: [0.43, 0.56, 0.57, 0.68],
  floor: [0, 0.62, 1, 1],
};
