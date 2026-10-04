import '../shared/base.css';
import './xr.css';
import { createSync } from '../shared/sync.js';
import { mountHud } from '../shared/hud.js';
import { PanoViewer } from '../shared/pano-viewer.js';
import { attachLookControls } from '../shared/look-controls.js';
import { MODE_TEXT, createScenePlayer } from '../shared/pano-set.js';
import { FLOOR_INFO, ISLAND_INFO, SPOT_INFO, describeScene } from '../shared/scene.js';
import { wrapYaw } from '../shared/angles.js';
import { createManagerFrame } from './manager-frame.js';

const STAGE_W = 1920;
const STAGE_H = 1080;
const XR_HFOV = 90; // 헤드셋 시야처럼 가로 90°
const params = new URLSearchParams(location.search);

const stage = document.getElementById('stage');
const viewer = new PanoViewer(document.getElementById('view'), { fov: { h: XR_HFOV }, fovRange: [60, 110] });
const sync = createSync({ role: 'xr' });

let latest = null;
let scene = null;
let swayOn = params.get('sway') !== '0';
const hud = mountHud(sync, {
  role: 'xr',
  extra: () => [
    ...(latest && scene ? [`장면: ${describeScene(latest.spot.customer, latest.island, latest.floor)} · ${MODE_TEXT[scene.mode] ?? '-'}`] : []),
    `흔들림 ${swayOn ? '켬' : '끔'}`,
  ],
  hints: 'F 전체화면 · H 표시 숨김 · G 방위 격자 · S 흔들림 · D 5초 끊기 · 드래그 둘러보기',
});
document.body.classList.toggle('show-guides', !hud.el.hidden);

// ---------- 파노라마 (고객 자리 기준) ----------
scene = createScenePlayer(viewer, { size: '8k', maxWidth: 8192, log: hud.log, onChange: () => hud.render() });

// ---------- 시점: 독립 회전 + 미세한 흔들림 + 변경된 곳으로 시선 이동 ----------
const GAZE_MS = 1600;
let gaze = null;

/** 고객 시선을 target 방향으로 천천히 돌린다. 이미 그쪽을 보고 있으면 그대로 둔다 */
function gazeTo(target) {
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

// ---------- 변경 알림 칩 (② 동기화 피드백, D6에 디자인) ----------
const chip = Object.assign(document.createElement('div'), { className: 'change-chip' });
stage.append(chip);
let chipTimer = 0;
function notify(text) {
  chip.textContent = '';
  chip.append(text, Object.assign(document.createElement('span'), { textContent: '매니저가 변경' }));
  chip.classList.add('show');
  clearTimeout(chipTimer);
  chipTimer = setTimeout(() => chip.classList.remove('show'), 3000);
}

const josa = (word, withBatchim, without) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const batchim = code >= 0 && code <= 11171 ? code % 28 !== 0 : /[013678lmn]$/i.test(word);
  return word + (batchim ? withBatchim : without);
};

// 태블릿에서 바꾼 옵션 → 알림 + 그쪽으로 시선 이동. 재접속 스냅샷에는 반응하지 않는다
sync.on('change', (msg) => {
  if (msg.type !== 'patch' || !latest) return;
  const p = msg.patch;
  const spot = p.spot?.customer ?? latest.spot.customer;
  const island = p.island ?? latest.island;
  const floor = p.floor ?? latest.floor;
  const targets = SPOT_INFO[spot].targets;
  const pending = scene.panos?.status(spot, island, floor) === 'missing' ? ' · 렌더 준비 중' : '';
  if (p.spot?.customer && p.spot.customer !== latest.spot.customer) {
    notify(`${josa(SPOT_INFO[spot].name, '으로', '로')} 이동`);
    gazeTo(targets.island);
  } else if (p.island && p.island !== latest.island) {
    notify(p.island === 'none' ? '아일랜드를 치움' : `${ISLAND_INFO[p.island].name} 배치${pending}`);
    if (gazeTo(targets.island)) effectDelay = GAZE_MS * 0.65;
  } else if (p.floor && p.floor !== latest.floor) {
    notify(p.floor === 'base' ? '기존 바닥으로 되돌림' : `${josa(FLOOR_INFO[p.floor].name, '으로', '로')} 변경${pending}`);
    if (gazeTo(targets.floor)) effectDelay = GAZE_MS * 0.65;
  }
});

// ---------- 매니저 시선 ----------
const frame = createManagerFrame(viewer, document.getElementById('mgrLayer'));
let tabletOnline = false;
const updateFrame = () => frame.setVisible(tabletOnline && latest?.spot.manager === latest?.spot.customer);

sync.on('state', (state) => {
  latest = structuredClone({ spot: state.spot, island: state.island, floor: state.floor });
  scene.show(state.spot.customer, state.island, state.floor, { delay: effectDelay });
  effectDelay = 0;
  frame.setTarget(state.managerView);
  updateFrame();
});
sync.on('info', ({ status, peers }) => {
  tabletOnline = status === 'online' && peers.tablet > 0;
  updateFrame();
});

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
      viewer.setOverlay(gridOn && scene.panos ? scene.panos.gridOverlay() : null);
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
