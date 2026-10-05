// 주석 그리기: 손가락(마우스)으로 그린 선을 방향(yaw·pitch)으로 바꿔 서버에 보낸다(50ms 묶음).
// 따라 그릴 점선(template)이 있으면 얼마나 따라 그렸는지 판정한다.
import { wrapYaw } from '../shared/angles.js';

const SEND_MS = 50;
const MIN_STEP_DEG = 0.15; // 이보다 가까운 점은 버린다
const PX_WIDTH = { 0.5: 2, 1: 3, 2: 4, 4: 6, 8: 9 }; // 굵기 단계 → 선 굵기(px)

/** 템플릿 점들 중 그린 선 가까이(tol°) 지나간 비율 */
export function coverage(template, pts, tol = 3.5) {
  if (!template.length || !pts.length) return 0;
  let hit = 0;
  for (const [ty, tp] of template) {
    const k = Math.cos((tp * Math.PI) / 180);
    if (pts.some(([y, p]) => Math.hypot(wrapYaw(y - ty) * k, p - tp) <= tol)) hit += 1;
  }
  return hit / template.length;
}

export function createAnnotator(viewer, sync, { pano = 'kitchen_front', onStrokeEnd = () => {} } = {}) {
  const el = viewer.renderer.domElement;
  const state = { enabled: false, tool: 'pencil', color: '#003270', width: 2 };
  let current = null; // { id, pts, pending, timer }
  let seq = 0;
  const mine = []; // 내가 그린 stroke id(지우개용)

  const toDir = (e) => {
    const r = el.getBoundingClientRect();
    const { yaw, pitch } = viewer.unproject(e.clientX - r.left, e.clientY - r.top);
    return [Math.round(yaw * 100) / 100, Math.round(pitch * 100) / 100];
  };

  function flush() {
    if (!current?.pending.length) return;
    sync.send({ type: 'stroke:append', id: current.id, pts: current.pending.splice(0, 200) });
  }

  el.addEventListener('pointerdown', (e) => {
    if (!state.enabled || current) return;
    el.setPointerCapture?.(e.pointerId);
    const id = `m${Date.now().toString(36)}-${seq++}`;
    const p = toDir(e);
    current = { id, pointer: e.pointerId, pts: [p], pending: [], timer: setInterval(flush, SEND_MS) };
    sync.send({ type: 'stroke:start', stroke: { id, tool: state.tool, width: PX_WIDTH[state.width] ?? 4, color: state.color, pano, pts: [p] } });
  });

  el.addEventListener('pointermove', (e) => {
    if (!current || e.pointerId !== current.pointer) return;
    const p = toDir(e);
    const last = current.pts[current.pts.length - 1];
    if (Math.hypot(wrapYaw(p[0] - last[0]), p[1] - last[1]) < MIN_STEP_DEG) return;
    current.pts.push(p);
    current.pending.push(p);
  });

  const end = (e) => {
    if (!current || e.pointerId !== current.pointer) return;
    clearInterval(current.timer);
    flush();
    sync.send({ type: 'stroke:end', id: current.id });
    mine.push(current.id);
    const done = current;
    current = null;
    onStrokeEnd(done);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  return {
    state,
    setEnabled(on) {
      state.enabled = on;
      el.style.cursor = on ? 'crosshair' : '';
    },
    eraseLast() {
      const id = mine.pop();
      if (id) sync.send({ type: 'stroke:erase', id });
    },
  };
}
