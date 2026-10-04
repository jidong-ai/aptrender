import '../shared/base.css';
import './xr.css';
import { createSync } from '../shared/sync.js';
import { mountHud } from '../shared/hud.js';
import { PanoViewer } from '../shared/pano-viewer.js';
import { attachLookControls } from '../shared/look-controls.js';
import { createPanoSet } from '../shared/pano-set.js';
import { createManagerFrame } from './manager-frame.js';

const STAGE_W = 1920;
const STAGE_H = 1080;
const XR_HFOV = 90; // 헤드셋 시야처럼 가로 90°
const params = new URLSearchParams(location.search);

const stage = document.getElementById('stage');
const viewer = new PanoViewer(document.getElementById('view'), { fov: { h: XR_HFOV }, fovRange: [60, 110] });
const sync = createSync({ role: 'xr' });

let current = { key: '-', real: false };
let swayOn = params.get('sway') !== '0';
const sign = (n) => (n > 0 ? '+' : '') + n.toFixed(0);
const hud = mountHud(sync, {
  role: 'xr',
  extra: () => [`장면: ${current.key} · ${current.real ? '렌더' : '테스트 격자'} · 흔들림 ${swayOn ? '켬' : '끔'}`],
  hints: 'F 전체화면 · H 표시 숨김 · G 방위 격자 · S 흔들림 · D 5초 끊기 · 드래그 둘러보기',
});
document.body.classList.toggle('show-guides', !hud.el.hidden);

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

createPanoSet(viewer, { size: '8k', maxWidth: 8192, log: hud.log }).then((set) => {
  panos = set;
  if (latest) showPano(latest);
});

// ---------- 시점: 독립 회전 + 미세한 흔들림 ----------
attachLookControls(viewer); // 테스트용 마우스 드래그. 전시 때는 아무도 조작하지 않는다

viewer.onFrame((dt, now) => {
  if (!swayOn) {
    viewer.offset.yaw = viewer.offset.pitch = 0;
    return;
  }
  const t = now / 1000;
  const TAU = Math.PI * 2;
  viewer.offset.yaw = 0.7 * Math.sin((t * TAU) / 11) + 0.25 * Math.sin((t * TAU) / 4.7);
  viewer.offset.pitch = 0.4 * Math.sin((t * TAU) / 8.3 + 1.3) + 0.15 * Math.sin((t * TAU) / 3.9);
});

// ---------- 매니저 시선 ----------
const frame = createManagerFrame(viewer, document.getElementById('mgrLayer'));

sync.on('state', (state) => {
  latest = state;
  showPano(state);
  frame.setTarget(state.managerView);
});
sync.on('info', ({ status, peers }) => frame.setVisible(status === 'online' && peers.tablet > 0));

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
      viewer.setOverlay(gridOn && panos ? panos.gridOverlay() : null);
      break;
    case 's':
      swayOn = !swayOn;
      hud.render();
      break;
    case 'd':
      sync.simulateDrop(5000);
      break;
  }
});
