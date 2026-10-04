import '../shared/base.css';
import './tablet.css';
import { createSync } from '../shared/sync.js';
import { mountHud } from '../shared/hud.js';
import { PanoViewer } from '../shared/pano-viewer.js';
import { attachLookControls } from '../shared/look-controls.js';
import { createPanoSet } from '../shared/pano-set.js';

const VIEW_SEND_MS = 100; // managerView 10Hz

const viewer = new PanoViewer(document.getElementById('view'), { fov: { v: 75 }, fovRange: [35, 100] });
const sync = createSync({ role: 'tablet' });
let current = { key: '-', real: false };
const hud = mountHud(sync, {
  role: 'tablet',
  extra: () => [`장면: ${current.key} · ${current.real ? '렌더' : '테스트 격자'}`],
});

// ---------- 파노라마 ----------
let panos = null;
let latest = null;
let showToken = 0;

async function showPano(state) {
  if (!panos) return;
  const key = `${state.preset}_${state.light}`;
  if (key === current.key) return;
  current = { key, real: panos.hasRender(state.preset, state.light) };
  hud.render();
  const token = ++showToken;
  const texture = await panos.textureFor(state.preset, state.light);
  if (token === showToken) viewer.show(texture);
}

createPanoSet(viewer, { size: '4k', maxWidth: 4096, log: hud.log }).then((set) => {
  panos = set;
  markRenders();
  if (latest) showPano(latest);
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

// ---------- 서버 상태 반영 ----------
const presetButtons = [...document.querySelectorAll('[data-preset]')];

function markRenders() {
  for (const btn of presetButtons) btn.classList.toggle('no-render', !panos.hasRender(btn.dataset.preset, latest?.light ?? 'day'));
}

let firstSnapshot = true;
sync.on('snapshot', (state, msg) => {
  // 처음 접속·리셋: 서버에 저장된 시점으로 맞춘다 / 재접속: 내 시점을 다시 알려준다
  if (firstSnapshot || msg.reason === 'reset') {
    viewer.setView(state.managerView);
    lastSent = '';
    firstSnapshot = false;
  } else {
    lastSent = '';
    queueView();
  }
});

sync.on('state', (state) => {
  latest = state;
  for (const btn of presetButtons) btn.setAttribute('aria-pressed', String(btn.dataset.preset === state.preset));
  if (panos) markRenders();
  showPano(state);
});

sync.on('info', ({ status }) => {
  document.body.classList.toggle('is-offline', status !== 'online');
});

for (const btn of presetButtons) {
  btn.addEventListener('click', () => sync.patch({ preset: btn.dataset.preset }));
}

// ---------- 디버그 ----------
const gridBtn = document.getElementById('grid');
gridBtn.addEventListener('click', () => {
  const on = gridBtn.getAttribute('aria-pressed') !== 'true';
  gridBtn.setAttribute('aria-pressed', String(on));
  viewer.setOverlay(on && panos ? panos.gridOverlay() : null);
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
