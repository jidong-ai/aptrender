// 서버와 두 화면(/tablet, /xr)이 함께 쓰는 상태 정의와 갱신 규칙.
// 서버는 sanitize*로 입력을 검증한 뒤 applyChange로 반영하고,
// 클라이언트는 서버가 보낸 메시지를 같은 applyChange로 반영한다.
// 각도 단위는 모두 도(°): yaw -180~180, pitch -90~90(위가 +), fov 10~120. 방향 규칙은 angles.js 참고.

import { clamp, wrapYaw } from './angles.js';
import { FLOORS, ISLANDS, SPOTS } from './scene.js';

export const PANELS = [null, 'client', 'detail', 'products', 'ohouse'];
export const TOOLS = ['pencil', 'highlighter', 'pen'];

export const LIMITS = {
  strokes: 500,
  ptsPerStroke: 4000,
  ptsPerAppend: 200,
};

export const WS_PATH = '/ws';

export function createInitialState(now = Date.now()) {
  return {
    // 매니저·고객 자리. 지금은 함께 이동(안 1). 따로 서는 연출(안 2)을 위해 필드만 나눠 둔다
    spot: { manager: 'v1', customer: 'v1' },
    island: 'none', // 'none' | '1' | '2' | '3'
    floor: 'base', // 'base'(기존) | 'a' | 'b' | 'c'
    dims: false,
    strokes: [],
    managerView: { yaw: 0, pitch: 0, fov: 75, aspect: 1.43 }, // fov = 태블릿 세로 시야각, aspect = 태블릿 화면비
    panel: null,
    call: { active: false },
    recStartedAt: now,
  };
}

const INVALID = Symbol('invalid');

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const PATCH_RULES = {
  island: (v) => (ISLANDS.includes(v) ? v : INVALID),
  floor: (v) => (FLOORS.includes(v) ? v : INVALID),
  spot: (v) => {
    if (!isObject(v)) return INVALID;
    const out = {};
    for (const who of ['manager', 'customer']) if (SPOTS.includes(v[who])) out[who] = v[who];
    return Object.keys(out).length ? out : INVALID;
  },
  dims: (v) => (typeof v === 'boolean' ? v : INVALID),
  panel: (v) => (PANELS.includes(v) ? v : INVALID),
  recStartedAt: (v) => (isNum(v) ? v : INVALID),
  call: (v) => (isObject(v) && typeof v.active === 'boolean' ? { active: v.active } : INVALID),
  managerView: (v) => {
    if (!isObject(v)) return INVALID;
    const out = {};
    if (isNum(v.yaw)) out.yaw = wrapYaw(v.yaw);
    if (isNum(v.pitch)) out.pitch = clamp(v.pitch, -90, 90);
    if (isNum(v.fov)) out.fov = clamp(v.fov, 10, 120);
    if (isNum(v.aspect)) out.aspect = clamp(v.aspect, 0.3, 4);
    return Object.keys(out).length ? out : INVALID;
  },
};

// strokes는 patch로 바꿀 수 없다. stroke:* 메시지만 사용.
export function sanitizePatch(patch) {
  const clean = {};
  const rejected = [];
  if (!isObject(patch)) return { patch: clean, rejected: ['(patch is not an object)'] };
  for (const [key, value] of Object.entries(patch)) {
    const rule = PATCH_RULES[key];
    const result = rule ? rule(value) : INVALID;
    if (result === INVALID) rejected.push(key);
    else clean[key] = result;
  }
  return { patch: clean, rejected };
}

export function sanitizePts(pts, max = LIMITS.ptsPerAppend) {
  if (!Array.isArray(pts) || pts.length > max) return null;
  const out = [];
  for (const p of pts) {
    if (!Array.isArray(p) || !isNum(p[0]) || !isNum(p[1])) return null;
    out.push([p[0], clamp(p[1], -90, 90)]);
  }
  return out;
}

export function sanitizeStroke(s) {
  if (!isObject(s)) return null;
  if (typeof s.id !== 'string' || !s.id || s.id.length > 64) return null;
  if (!TOOLS.includes(s.tool)) return null;
  if (!isNum(s.width) || s.width <= 0 || s.width > 64) return null;
  if (typeof s.color !== 'string' || s.color.length > 32) return null;
  const pts = sanitizePts(s.pts ?? []);
  if (!pts) return null;
  const spot = s.spot ?? 'v1'; // 주석은 그린 시점에서만 같은 자리에 맞는다
  if (!SPOTS.includes(spot)) return null;
  return { id: s.id, tool: s.tool, width: s.width, color: s.color, spot, pts };
}

// 검증이 끝난 변경 메시지를 state에 반영한다(state를 직접 수정).
// 반환값: 실제로 반영됐으면 true.
export function applyChange(state, msg) {
  switch (msg.type) {
    case 'patch': {
      for (const [key, value] of Object.entries(msg.patch)) {
        if (key === 'managerView' || key === 'call' || key === 'spot') Object.assign(state[key], value);
        else state[key] = value;
      }
      return true;
    }
    case 'stroke:start': {
      if (state.strokes.some((s) => s.id === msg.stroke.id)) return false;
      if (state.strokes.length >= LIMITS.strokes) return false;
      state.strokes.push(structuredClone(msg.stroke));
      return true;
    }
    case 'stroke:append': {
      const stroke = state.strokes.find((s) => s.id === msg.id);
      if (!stroke || stroke.pts.length + msg.pts.length > LIMITS.ptsPerStroke) return false;
      stroke.pts.push(...msg.pts);
      return true;
    }
    case 'stroke:end':
      return state.strokes.some((s) => s.id === msg.id);
    case 'stroke:erase': {
      const i = state.strokes.findIndex((s) => s.id === msg.id);
      if (i < 0) return false;
      state.strokes.splice(i, 1);
      return true;
    }
    default:
      return false;
  }
}
