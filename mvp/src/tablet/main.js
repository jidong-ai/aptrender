import '../shared/base.css';
import './tablet.css';
import { createSync } from '../shared/sync.js';
import { mountHud } from '../shared/hud.js';
import { PanoViewer } from '../shared/pano-viewer.js';
import { attachLookControls } from '../shared/look-controls.js';
import { MODE_TEXT, createScenePlayer } from '../shared/pano-set.js';
import { describeScene } from '../shared/scene.js';

const VIEW_SEND_MS = 100; // managerView 10Hz

const viewer = new PanoViewer(document.getElementById('view'), { fov: { v: 75 }, fovRange: [35, 100] });
const sync = createSync({ role: 'tablet' });
let latest = null;
let scene = null;
const hud = mountHud(sync, {
  role: 'tablet',
  extra: () => (latest && scene ? [`장면: ${describeScene(latest.spot.manager, latest.island, latest.floor)} · ${MODE_TEXT[scene.mode] ?? '-'}`] : []),
});
scene = createScenePlayer(viewer, {
  size: '4k',
  maxWidth: 4096,
  log: hud.log,
  onChange: () => {
    hud.render();
    if (latest) render(latest);
  },
});

// ---------- 시점 공유 (10Hz) ----------
let lastSentAt = 0;
let lastSent = '';
let sendTimer = 0;
const round = (n) => Math.round(n * 10) / 10;

function sendView() {
  clearTimeout(sendTimer);
  sendTimer = 0;
  const v = viewer.getView();
  const managerView = { yaw: round(v.yaw), pitch: round(v.pitch), fov: round(v.fov), aspect: Math.round(v.aspect * 1000) / 1000 };
  const key = JSON.stringify(managerView);
  if (key === lastSent) return;
  if (sync.patch({ managerView })) {
    lastSent = key;
    lastSentAt = performance.now();
  }
}

function queueView() {
  const wait = VIEW_SEND_MS - (performance.now() - lastSentAt);
  if (wait <= 0) sendView();
  else if (!sendTimer) sendTimer = setTimeout(sendView, wait); // 마지막 위치도 꼭 보낸다
}

attachLookControls(viewer, { onChange: queueView });
viewer.onResize(() => queueView()); // 화면 회전 등으로 화면비가 바뀌면 XR 프레임도 갱신

// ---------- 옵션 버튼 ----------
const buttons = {
  spot: [...document.querySelectorAll('[data-spot]')],
  island: [...document.querySelectorAll('[data-island]')],
  floor: [...document.querySelectorAll('[data-floor]')],
};

// 시점은 매니저·고객이 함께 이동(안 1). 아일랜드·바닥재는 장면 전체에 적용
for (const btn of buttons.spot) btn.addEventListener('click', () => sync.patch({ spot: { manager: btn.dataset.spot, customer: btn.dataset.spot } }));
for (const btn of buttons.island) {
  // 아일랜드를 치우면 바닥재도 기존으로 되돌린다(아일랜드 없는 바닥재 조합은 렌더하지 않음)
  btn.addEventListener('click', () => sync.patch(btn.dataset.island === 'none' ? { island: 'none', floor: 'base' } : { island: btn.dataset.island }));
}
for (const btn of buttons.floor) btn.addEventListener('click', () => sync.patch({ floor: btn.dataset.floor }));

// 버튼 표시는 서버가 확정한 상태로만 그린다(서버가 단일 진실)
function render(state) {
  const spot = state.spot.manager;
  const press = (list, attr, value) => list.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === value)));
  press(buttons.spot, 'spot', spot);
  press(buttons.island, 'island', state.island);
  press(buttons.floor, 'floor', state.floor);
  // 체험 순서: 아일랜드를 먼저 놓아야 바닥재를 고를 수 있다(렌더 장수도 줄어든다)
  for (const b of buttons.floor) b.disabled = state.island === 'none' && b.dataset.floor !== 'base';

  // 점선 테두리 = 이 버튼을 누르면 렌더가 없어 테스트 격자가 보임
  const panos = scene.panos;
  if (!panos) return;
  for (const b of buttons.spot) b.classList.toggle('no-render', !panos.available(b.dataset.spot, state.island, state.floor));
  for (const b of buttons.island) b.classList.toggle('no-render', !panos.available(spot, b.dataset.island, state.floor));
  for (const b of buttons.floor) b.classList.toggle('no-render', !panos.available(spot, state.island, b.dataset.floor));
}

// ---------- 서버 상태 반영 ----------
let firstSnapshot = true;
sync.on('snapshot', (state, msg) => {
  // 처음 접속·리셋: 서버에 저장된 시점으로 맞춘다 / 재접속: 내 시점을 다시 알려준다
  if (firstSnapshot || msg.reason === 'reset') viewer.setView(state.managerView);
  firstSnapshot = false;
  lastSent = '';
  queueView();
});

sync.on('state', (state) => {
  latest = state;
  render(state);
  scene.show(state.spot.manager, state.island, state.floor);
});

sync.on('info', ({ status }) => {
  document.body.classList.toggle('is-offline', status !== 'online');
});

// ---------- 디버그 ----------
const gridBtn = document.getElementById('grid');
gridBtn.addEventListener('click', () => {
  const on = gridBtn.getAttribute('aria-pressed') !== 'true';
  gridBtn.setAttribute('aria-pressed', String(on));
  viewer.setOverlay(on && scene.panos ? scene.panos.gridOverlay() : null);
});
document.getElementById('drop').addEventListener('click', () => sync.simulateDrop(5000));
document.getElementById('reset').addEventListener('click', () => sync.reset());

const readout = document.getElementById('readout');
const sign = (n) => (n > 0 ? '+' : '') + n.toFixed(1);
let readoutAt = 0;
viewer.onFrame((dt, now) => {
  if (now - readoutAt < 100) return;
  readoutAt = now;
  readout.textContent = `yaw ${sign(viewer.yaw)}° · pitch ${sign(viewer.pitch)}° · fov ${viewer.vFov.toFixed(0)}°`;
});
