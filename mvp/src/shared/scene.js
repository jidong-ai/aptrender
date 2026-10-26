// 장면 정의: 배경 파노라마(장면 ID) + 그 위에 겹치는 누끼 레이어(아일랜드·바닥재).
// 파일 이름 = 장면/레이어 ID. 이름·자리·좌표는 여기서만 고친다.

// 배경 파노라마. 같은 공간의 렌더는 카메라를 움직이지 않는다(누끼가 제자리에 겹쳐야 하므로)
export const PANOS = {
  store_1: { name: '위브 매장 입구' },
  store_2: { name: '위브 매장 자재 라이브러리' },
  store_3: { name: '위브 매장 상담 구역' },
  counsel: { name: '상담실' },
  kitchen_front: { name: '주방 정면', view: 'front' },
  kitchen_side: { name: '주방 측면', view: 'side' },
};

// 누끼 레이어. pano = 이 레이어가 겹쳐지는 배경.
// 체험은 아일랜드 배치(S3) → 바닥재 변경(S4) 순서. 화면에는 배경 위에 바닥재, 그 위에 아일랜드를 겹친다(아일랜드가 바닥 위에 서 있으므로) → 바닥재는 아일랜드 없이 렌더
export const LAYERS = {
  island_a_front: { kind: 'island', option: 'a', pano: 'kitchen_front' },
  island_b_front: { kind: 'island', option: 'b', pano: 'kitchen_front' },
  island_c_front: { kind: 'island', option: 'c', pano: 'kitchen_front' },
  island_a_side: { kind: 'island', option: 'a', pano: 'kitchen_side' }, // 예전 island_a 렌더(시나리오에는 안 씀)
  island_b_side: { kind: 'island', option: 'b', pano: 'kitchen_side' },
  floor_portland_front: { kind: 'floor', option: 'portland', pano: 'kitchen_front' },
  floor_flosso_front: { kind: 'floor', option: 'flosso', pano: 'kitchen_front' },
  floor_portland_side: { kind: 'floor', option: 'portland', pano: 'kitchen_side' }, // S4는 측면에서 진행
  floor_flosso_side: { kind: 'floor', option: 'flosso', pano: 'kitchen_side' },
};

// 오브제만 잘라 낸 누끼(파노라마 크기가 아닌 PNG)를 배경 위 어디에 세울지(도 단위).
//  yaw = 가로 중심, bottom = 누끼 아랫변이 닿는 pitch, height = 화면에서의 높이.
//  서버가 켜질 때 이 값으로 자리를 다시 계산하므로 숫자만 바꾸고 서버를 다시 켜면 된다(pano:prep 없이도)
export const CUT_PLACE = {
  // 측면 주방 통로(조리대 앞). 10/15 사용자 지정: 앞판 아랫변을 표시한 바닥선에 맞춤. 10/16 크기 190%(처음 15° 기준)
  island_b_side: { yaw: 6.7, bottom: -32.9, height: 28.5 },
  // 정면: island_b_front.jpg에서 아일랜드만 오린 누끼. 그 렌더는 카메라가 kitchen_front보다 뒤에 있어서
  // 두 렌더의 뒷벽 바닥선(pitch -14.6° → -16.6°)으로 카메라 이동을 재고, 같은 바닥 위치·크기로 옮겼다(1.3배)
  island_b_front: { yaw: -5.2, bottom: -32.5, height: 23 },
};

/** CUT_PLACE 자리 + 누끼 가로세로비 → 파노라마 uv 사각형 [x0, y0, x1, y1] */
export function placedRect({ yaw, bottom, height }, aspect) {
  const hFrac = height / 180; // 세로 비율(0~1)
  const wFrac = (hFrac * aspect) / 2; // 가로 비율: 파노라마는 가로가 세로의 2배
  const cx = 0.5 + yaw / 360;
  const by = 0.5 - bottom / 180;
  return [cx - wFrac / 2, by - hFrac, cx + wFrac / 2, by].map((v) => Math.round(v * 1e5) / 1e5);
}

export const ISLAND_OPTIONS = ['a', 'b', 'c'];
export const FLOOR_OPTIONS = ['portland', 'flosso'];

// D5에서 뽑은 예전 이름 → ID
export const ALIASES = {
  pano_front: 'kitchen_front',
  pano_side: 'kitchen_side',
  island_a: 'island_a_side',
  // 측면 렌더를 '_left'로 저장한 경우(10/26 바닥재 렌더)
  floor_portland_left: 'floor_portland_side',
  floor_flosso_left: 'floor_flosso_side',
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
  // 매장 렌더(10/8): 바닥 화살표는 다음 공간 쪽 통로 바닥. 사람·가구와 겹치지 않는 자리
  store_1: { hotspot: { yaw: 8, pitch: -22, to: 'store_2', label: '안쪽으로' } },
  store_2: { hotspot: { yaw: -6, pitch: -24, to: 'store_3', label: '안쪽으로' } },
  store_3: { hotspot: { yaw: -11, pitch: -11, to: 'counsel', label: '상담실로' } }, // 복도 입구 바닥(S0-6d·e에서 복도 쪽으로 확대한 시야 안)
  counsel: {},
  kitchen_front: {
    island: { yaw: -5, pitch: -20 }, // 아일랜드 누끼(CUT_PLACE.island_b_front) 가운데. 배치 연출 때 시선이 여기로
    floor: { yaw: 0, pitch: -42 },
    // 싱크대 하부장 앞 모서리 → 900mm 떨어진 아일랜드 앞 왼쪽 모서리. 10/26 사용자 지정(Figma 1516:1095 빨간 선,
    // 4096×2048 기준 (1723.5, 1369) → (1898.5, 1390.5))
    dimension: { from: { yaw: -28.5, pitch: -30.3 }, to: { yaw: -13.1, pitch: -32.2 }, label: '900mm' },
    // 따라 그릴 체크 표시(점선). 900mm 지점 위
    check: [
      [-2.5, -21],
      [0, -24],
      [5, -17],
    ],
  },
  kitchen_side: {
    island: { yaw: 6.7, pitch: -19 }, // 아일랜드 누끼(CUT_PLACE.island_b_side) 가운데
    floor: { yaw: 0, pitch: -30 }, // 옵션수정에서 누르는 바닥면(임시 영역 FLOOR_AREA.kitchen_side의 가운데쯤)
  },
};

// 바닥재 적용 영역(선택 영역)의 기본값. 이미지 기준 0~1 좌표의 다각형.
// 마스크 편집기(/mask)나 Figma로 그린 마스크(assets/pano/masks/{장면}_floor.svg|png)가 있으면 그걸 쓴다(assets/pano/README.md).
// 바닥재 렌더(floor_*.png)는 이 영역만 잘라 레이어가 된다
export const FLOOR_AREA = {
  // 10/26 바닥재 렌더 기준으로 벽과 바닥이 만나는 선을 따라 잡은 시작값. 마스크 편집기(/mask)에서 다듬는다
  kitchen_front: [
    [0.0000, 0.6687],
    [0.1000, 0.6475],
    [0.1062, 0.6562],
    [0.1562, 0.6900],
    [0.2188, 0.7025],
    [0.2812, 0.6937],
    [0.3375, 0.6650],
    [0.3406, 0.6188],
    [0.3812, 0.6188],
    [0.3825, 0.6250],
    [0.4188, 0.6625],
    [0.4625, 0.5925],
    [0.5406, 0.5925],
    [0.5906, 0.6600],
    [0.6531, 0.6350],
    [0.6562, 0.6750],
    [0.7000, 0.7100],
    [0.7688, 0.7250],
    [0.8375, 0.7150],
    [0.8875, 0.6813],
    [0.9000, 0.6600],
    [1.0000, 0.6687],
    [1.0000, 1.0000],
    [0.0000, 1.0000],
  ],
  kitchen_side: [
    [0.0000, 0.7438],
    [0.0250, 0.6875],
    [0.0594, 0.6250],
    [0.1250, 0.6100],
    [0.2063, 0.5938],
    [0.2250, 0.5900],
    [0.3000, 0.6000],
    [0.3740, 0.6140],
    [0.3750, 0.5790],
    [0.4160, 0.5790],
    [0.4180, 0.6000],
    [0.4400, 0.6160],
    [0.5080, 0.5730],
    [0.5938, 0.5750],
    [0.5969, 0.6938],
    [0.6563, 0.6775],
    [0.6813, 0.6750],
    [0.6825, 0.7938],
    [0.7188, 0.8400],
    [0.8125, 0.8750],
    [0.9063, 0.8700],
    [0.9688, 0.8400],
    [1.0000, 0.8188],
    [1.0000, 1.0000],
    [0.0000, 1.0000],
  ],
};

// 렌더가 없을 때 와이어프레임 레이어를 그릴 자리(이미지 기준 0~1 사각형)
export const PLACEHOLDER_RECT = {
  island: [0.43, 0.56, 0.57, 0.68],
  floor: [0, 0.62, 1, 1],
};
