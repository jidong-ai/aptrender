import 'pretendard/dist/web/variable/pretendardvariable.css';
import '../shared/base.css';
import './xr.css';
import { createSync } from '../shared/sync.js';
import { mountHud } from '../shared/hud.js';
import { PanoViewer } from '../shared/pano-viewer.js';
import { attachLookControls } from '../shared/look-controls.js';
import { PART_TEXT, createScenePlayer } from '../shared/pano-set.js';
import { ANCHORS, PANOS } from '../shared/scene.js';
import { SPEAKERS, STEP, STEPS, stepIndex, tabletSceneFor, xrSceneFor } from '../shared/scenario.js';
import { FLOORS, ISLANDS, estimate, won } from '../shared/catalog.js';
import { createAnchors, createSphereLines } from '../shared/overlays.js';
import { icon, loadUiAssets } from '../shared/ui-assets.js';
import { wrapYaw } from '../shared/angles.js';
import { createManagerFrame } from './manager-frame.js';

const STAGE_W = 1920;
const STAGE_H = 1080;
const XR_HFOV = 90; // 헤드셋 시야처럼 가로 90°
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls ?? '', textContent: text ?? '' });

await loadUiAssets();

const stage = $('stage');
const viewer = new PanoViewer($('view'), { fov: { h: XR_HFOV }, fovRange: [60, 110] });
const sync = createSync({ role: 'xr' });

let latest = null;
let player = null;
let swayOn = params.get('sway') !== '0';
const hud = mountHud(sync, {
  role: 'xr',
  extra: () => {
    if (!latest || !player) return [];
    const p = player.parts;
    const parts = ['base', 'island', 'floor'].filter((k) => p[k]).map((k) => `${k} ${PART_TEXT[p[k]]}`);
    return [`단계 ${latest.flow.step} · ${PANOS[player.current?.pano]?.name ?? '대기'} · ${parts.join(' · ')}`, `흔들림 ${swayOn ? '켬' : '끔'}`];
  },
  hints: 'F 전체화면 · H 표시 숨김 · G 방위 격자 · S 흔들림 · D 5초 끊기 · R 처음으로 · ←/→ 단계 이동 · 드래그 둘러보기',
});
document.body.classList.toggle('show-guides', !hud.el.hidden);

// ---------- 파노라마 (고객 시점) ----------
player = createScenePlayer(viewer, { size: '8k', maxWidth: 8192, log: hud.log, onChange: () => hud.render() });

// ---------- 시점: 독립 회전 + 미세한 흔들림 + 변경된 곳으로 시선 이동 ----------
const GAZE_MS = 1600;
let gaze = null;

/** 고객 시선을 target 방향으로 천천히 돌린다. 이미 그쪽을 보고 있으면 그대로 둔다 */
function gazeTo(target) {
  if (!target) return false;
  if (Math.abs(wrapYaw(target.yaw - viewer.yaw)) < 12 && Math.abs(target.pitch - viewer.pitch) < 10) return false;
  gaze = { from: { yaw: viewer.yaw, pitch: viewer.pitch }, to: target, start: performance.now() };
  return true;
}
// 고개를 돌리는 동안엔 배치 연출을 늦춰, 고객이 오브제가 놓이는 순간을 보게 한다
let effectDelay = 0;

attachLookControls(viewer, { onChange: () => (gaze = null) }); // 테스트용 마우스 드래그(드래그하면 자동 시선 이동 취소)

viewer.onFrame((dt, now) => {
  if (!swayOn) {
    viewer.offset.yaw = viewer.offset.pitch = 0;
  } else {
    const t = now / 1000;
    const TAU = Math.PI * 2;
    viewer.offset.yaw = 0.7 * Math.sin((t * TAU) / 11) + 0.25 * Math.sin((t * TAU) / 4.7);
    viewer.offset.pitch = 0.4 * Math.sin((t * TAU) / 8.3 + 1.3) + 0.15 * Math.sin((t * TAU) / 3.9);
  }
  if (gaze) {
    const t = Math.min(1, (now - gaze.start) / GAZE_MS);
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    viewer.setView({
      yaw: gaze.from.yaw + wrapYaw(gaze.to.yaw - gaze.from.yaw) * e,
      pitch: gaze.from.pitch + (gaze.to.pitch - gaze.from.pitch) * e,
    });
    if (t >= 1) gaze = null;
  }
});

// ---------- 상담홈 크롬 (Figma 1045:1708) ----------
$('xrPill').append(icon('options', { file: 'xr-options.svg' }), '옵션변경');
const xrTime = el('span', '', '00:00');
$('xrTimer').append(icon('stop', { file: 'xr-stop.svg', size: 40 }), xrTime);
const NAV = [
  ['person', 'xr-person.svg', '고객정보'],
  ['bag', 'xr-bag.svg', '적용제품'],
  ['ohouse', 'xr-ohouse.svg', '오늘의집'],
];
for (const [name, file, label] of NAV) {
  const item = el('span', 'item');
  item.dataset.name = name;
  item.append(icon(name, { file, size: 46 }), label);
  $('xrNav').append(item);
}

// ---------- wire 화면 ----------
$('standby').append(el('div', 'logo', 'Weave'), el('p', '', 'XR 상담을 준비하고 있어요'), el('small', '', '매니저가 상담을 시작하면 김민선 님의 주방이 열립니다'));
function showBoot() {
  $('boot').textContent = '';
  const bar = el('div', 'bar');
  bar.append(el('i'));
  $('boot').append(el('p', '', '김민선 님의 주방 3D 스캔을 불러오는 중'), bar, el('small', '', '헤드셋 착용 확인됨'));
}

// ---------- 변경 알림 칩 ----------
const chip = el('div', 'change-chip');
stage.append(chip);
let chipTimer = 0;
function notify(text) {
  chip.textContent = '';
  chip.append(text, el('span', '', '매니저가 변경'));
  chip.classList.add('show');
  clearTimeout(chipTimer);
  chipTimer = setTimeout(() => chip.classList.remove('show'), 3200);
}

// ---------- 공간 위 표시: 주석·치수 ----------
const lines = createSphereLines(viewer);
const anchors = createAnchors(viewer, $('anchors'));
const dimLabel = anchors.add(Object.assign(el('div', 'space-label'), { innerHTML: `<span>${ANCHORS.kitchen_front.dimension.label}</span>` }), null);
const mgrLabel = anchors.add(Object.assign(el('div', 'space-label mgr'), { innerHTML: '<span>매니저</span>' }), null);
const dimMid = (() => {
  const d = ANCHORS.kitchen_front.dimension;
  return { yaw: d.from.yaw + wrapYaw(d.to.yaw - d.from.yaw) / 2, pitch: (d.from.pitch + d.to.pitch) / 2 };
})();

// ---------- 적용 제품·예상 금액 (wire) ----------
let lastTotal = null;
function renderPrice(choices) {
  const box = $('price');
  const { items, total } = estimate(choices);
  box.hidden = !items.length;
  if (!items.length) {
    lastTotal = null;
    return;
  }
  box.textContent = '';
  box.append(el('h4', '', '적용 제품'));
  if (choices.island) {
    const it = el('div', 'item');
    it.append(el('small', '', '아일랜드'), el('b', '', ISLANDS[choices.island].name));
    box.append(it);
  }
  if (choices.floor) {
    const it = el('div', 'item');
    it.append(el('small', '', '바닥재'), el('b', '', FLOORS[choices.floor].name));
    box.append(it);
  }
  const t = el('div', 'total', won(total));
  if (lastTotal !== null && lastTotal !== total) t.classList.add('bump');
  lastTotal = total;
  box.append(el('small', '', '예상 금액'), t, el('div', 'note', '전시용 예시 금액'));
}

function renderReport(choices) {
  const { total } = estimate(choices);
  const card = el('div', 'card');
  card.append(el('small', '', '오늘의집 위브'), el('h2', '', '상담 리포트가 도착했어요'));
  for (const [label, name] of [
    ['아일랜드', choices.island ? ISLANDS[choices.island].name : '-'],
    ['바닥재', choices.floor ? FLOORS[choices.floor].name : '-'],
  ]) {
    const row = el('div', 'row');
    row.append(el('span', '', label), el('b', '', name));
    card.append(row);
  }
  card.append(el('div', 'total', `예상 ${won(total)}`), el('q', '', '이대로 진행하고 싶어요'));
  $('report').textContent = '';
  $('report').append(card);
}

// ---------- 매니저 시선 ----------
const frame = createManagerFrame(viewer, $('mgrLayer'));
let tabletOnline = false;
const updateFrame = () => frame.setVisible(Boolean(tabletOnline && latest && shownPano && tabletSceneFor(latest.flow).pano === shownPano));

// ---------- 서버 상태 → 화면 ----------
let prev = null; // 직전 flow
const josa = (word, withBatchim, without) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const batchim = code >= 0 && code <= 11171 ? code % 28 !== 0 : /[013678lmn]$/i.test(word);
  return word + (batchim ? withBatchim : without);
};

// 매니저가 바꾼 것 → 알림 + 그쪽으로 시선. 재접속 스냅샷에는 반응하지 않는다
sync.on('change', (msg) => {
  if (msg.type === 'stroke:start' && msg.stroke.pts[0]) {
    const [yaw, pitch] = msg.stroke.pts[0];
    gazeTo({ yaw, pitch });
    return;
  }
  if (msg.type !== 'flow' || !prev) return;
  const now = msg.flow;
  const anchorsHere = ANCHORS[xrSceneFor(now, sync.serverNow()).pano] ?? ANCHORS.kitchen_front;
  if (now.choices.island !== prev.choices.island && now.choices.island) {
    notify(`${josa(ISLANDS[now.choices.island].name, '을', '를')} 배치`);
    if (gazeTo(anchorsHere.island)) effectDelay = GAZE_MS * 0.65;
  } else if (now.choices.floor !== prev.choices.floor && now.choices.floor) {
    notify(`바닥재 ${FLOORS[now.choices.floor].name.replace('진 그란데 스퀘어 ', '')} 적용`);
    if (gazeTo(anchorsHere.floor)) effectDelay = GAZE_MS * 0.65;
  }
  if (STEP[now.step].xr.dims && !STEP[prev.step].xr.dims) gazeTo(dimMid);
});

// 공간이 바뀔 때(측면 ↔ 정면): 알림 + 정면을 보고 시작 + 아일랜드 쪽으로 시선
let shownPano = null;
function onSpaceChange(want, was) {
  if (want.pano === 'kitchen_side') notify('아일랜드 측면으로 이동');
  else if (was === 'kitchen_side') notify('정면으로 돌아옴');
  viewer.setView({ yaw: 0, pitch: -6 });
  if (want.island) gazeTo(ANCHORS[want.pano]?.island);
}
const rerender = () => latest && onState(latest);

let lastStep = null;
sync.on('state', onState);
function onState(state) {
  const { flow } = state;
  const step = STEP[flow.step];
  const stepChanged = flow.step !== lastStep;
  lastStep = flow.step;
  const screen = step.xr.screen;
  const inHome = screen === 'home' || screen === 'ending';

  $('standby').hidden = screen !== 'standby';
  $('boot').hidden = screen !== 'boot';
  if (screen === 'boot' && stepChanged) showBoot();
  $('home').hidden = !inHome || screen === 'ending';
  for (const item of $('xrNav').children) item.classList.toggle('on', item.dataset.name === 'bag' && Boolean(flow.choices.island));

  // 자막: 매니저·고객 대사만(안내 문구는 태블릿에만)
  const cap = step.caption && step.caption.speaker !== 'guide' && screen === 'home' ? step.caption : null;
  $('subtitle').hidden = !cap;
  if (cap) {
    $('subtitle').dataset.speaker = cap.speaker;
    $('subSpeaker').textContent = SPEAKERS[cap.speaker];
    $('subText').textContent = cap.text;
  }

  if (screen === 'home') renderPrice(flow.choices);
  else $('price').hidden = true;
  $('report').hidden = !step.xr.report;
  if (step.xr.report && stepChanged) renderReport(flow.choices);

  const want = xrSceneFor(flow, sync.serverNow());
  if (step.xr.sideAfter && stepChanged) setTimeout(() => latest === state && rerender(), Math.max(0, flow.enteredAt + step.xr.sideAfter - sync.serverNow()) + 20);
  if (want.pano !== shownPano && shownPano && want.pano) onSpaceChange(want, shownPano);
  shownPano = want.pano;
  if (stepChanged && stepIndex(flow.step) === stepIndex('S2-1') && prev && STEP[prev.step]?.xr.screen === 'boot') viewer.setView({ yaw: 0, pitch: -4 });
  player.show(want, { delay: effectDelay });
  effectDelay = 0;

  const dims = Boolean(step.xr.dims) && want.pano === 'kitchen_front';
  lines.setDimension(dims ? ANCHORS.kitchen_front.dimension : null);
  dimLabel.set(dims ? dimMid : null);
  lines.setStrokes(state.strokes, want.pano);
  const last = state.strokes.filter((s) => s.pano === want.pano && s.pts.length).at(-1);
  mgrLabel.set(last ? { yaw: last.pts.at(-1)[0], pitch: last.pts.at(-1)[1] } : null);

  frame.setTarget(state.managerView);
  prev = structuredClone(flow);
  latest = state;
  updateFrame();
}
sync.on('info', ({ status, peers }) => {
  tabletOnline = status === 'online' && peers.tablet > 0;
  updateFrame();
});

setInterval(() => {
  const at = latest?.flow.timerAt;
  const s = at ? Math.max(0, Math.floor((sync.serverNow() - at) / 1000)) : 0;
  xrTime.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}, 250);

window.__weave = { viewer, sync, get state() { return latest; } }; // 자동 테스트·디버그용

// ---------- 화면 맞춤 ----------
function fitStage() {
  const scale = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  document.documentElement.style.setProperty('--s', scale); // 무대 밖 UI도 같은 비율로
}
addEventListener('resize', fitStage);
fitStage();

let gridOn = false;
addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const cur = latest?.flow.step;
  const jump = (d) => cur && sync.send({ type: 'jump', step: STEPS[Math.min(STEPS.length - 1, Math.max(0, stepIndex(cur) + d))].id });
  switch (e.key.toLowerCase()) {
    case 'f':
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
      break;
    case 'h':
      document.body.classList.toggle('show-guides', hud.toggle());
      break;
    case 'g':
      gridOn = !gridOn;
      viewer.setOverlay(gridOn && player.set ? player.set.gridOverlay() : null);
      break;
    case 's':
      swayOn = !swayOn;
      hud.render();
      break;
    case 'd':
      sync.simulateDrop(5000);
      break;
    case 'r':
      sync.reset();
      break;
    case 'arrowleft':
      jump(-1);
      break;
    case 'arrowright':
      jump(1);
      break;
  }
});
