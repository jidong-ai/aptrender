import 'pretendard/dist/web/variable/pretendardvariable.css';
import '../shared/base.css';
import './tablet.css';
import { createSync } from '../shared/sync.js';
import { mountHud } from '../shared/hud.js';
import { PanoViewer } from '../shared/pano-viewer.js';
import { attachLookControls } from '../shared/look-controls.js';
import { PART_TEXT, createScenePlayer } from '../shared/pano-set.js';
import { ANCHORS, PANOS } from '../shared/scene.js';
import { SPEAKERS, STEP, STEPS, stepIndex, tabletSceneFor } from '../shared/scenario.js';
import { createAnchors, createSphereLines, interpolate } from '../shared/overlays.js';
import { icon, loadUiAssets } from '../shared/ui-assets.js';
import { wrapYaw } from '../shared/angles.js';
import { createCoach } from './coach.js';
import { coverage, createAnnotator } from './annotate.js';
import { buildAnnotateBar, buildCardHead, buildNav, buildStart, buildTimer, buildTools, h, mmss, renderEnding, renderPanel } from './ui.js';

const VIEW_SEND_MS = 100; // managerView 10Hz
const FRAME_H = 1292; // Figma 매니저 프레임 높이
const LOOK_DEG = 60; // S2-1: 이만큼 둘러보면 '다음'이 열린다
const LOOK_MS = 6000; // 또는 이 시간이 지나면
const TRACE_PASS = 0.6; // 점선의 60% 이상을 따라 그리면 통과
const TRACE_TRIES = 3; // 이만큼 시도하면 그냥 통과(전시 체험이 막히지 않게)
const IDLE_MS = 90_000;
const IDLE_CONFIRM_MS = 10_000;
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// ---------- 화면 맞춤: Figma 프레임 높이 기준 ----------
function fit() {
  document.documentElement.style.setProperty('--k', innerHeight / FRAME_H);
}
addEventListener('resize', fit);
fit();

await loadUiAssets();

const viewer = new PanoViewer($('view'), { fov: { v: 75 }, fovRange: [35, 100] });
const sync = createSync({ role: 'tablet' });
let latest = null;
let player = null;
const hud = mountHud(sync, {
  role: 'tablet',
  extra: () => {
    if (!latest || !player) return [];
    const p = player.parts;
    const parts = ['base', 'island', 'floor'].filter((k) => p[k]).map((k) => `${k} ${PART_TEXT[p[k]]}`);
    return [`단계 ${latest.flow.step} · ${PANOS[player.current?.pano]?.name ?? '-'} · ${parts.join(' · ')}`, `yaw ${viewer.yaw.toFixed(1)}° · pitch ${viewer.pitch.toFixed(1)}° (화면 중앙 = 좌표 재기)`];
  },
});
if (!params.has('hud')) hud.el.hidden = true;
setInterval(() => !hud.el.hidden && hud.render(), 250);

player = createScenePlayer(viewer, { size: '4k', maxWidth: 4096, log: hud.log, onChange: () => hud.render() });

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

let lookAcc = 0;
let lastYaw = 0;
const look = attachLookControls(viewer, {
  onChange: (v) => {
    lookAcc += Math.abs(wrapYaw(v.yaw - lastYaw));
    lastYaw = v.yaw;
    queueView();
  },
});
viewer.onFrame(() => queueView()); // 자동 회전(돌리·체크 자리로 돌리기) 중에도 XR 프레임이 따라오게
viewer.onResize(() => queueView());

// ---------- UI 조립 ----------
buildStart($('startBg'), $('startLogo'), $('startArrow'));
buildTools($('tools'));
buildNav($('nav'));
const timerText = buildTimer($('timer'));
const cardTime = buildCardHead($('cardHead'));

// ---------- 공간 위 표시 ----------
const lines = createSphereLines(viewer);
const anchors = createAnchors(viewer, $('anchors'));
const hotspotEl = h('button.hotspot', { type: 'button', dataset: { target: 'hotspot' } }, icon('arrow'), h('span.hotspot-label'));
const hotspot = anchors.add(hotspotEl, null, { edge: true });
const dimLabel = anchors.add(h('div.dim-label', {}, h('span', {}, ANCHORS.kitchen_front.dimension.label)), null);
const traceSpot = anchors.add(h('div.trace-spot'), null);

const CHECK = ANCHORS.kitchen_front.check;
const checkDense = CHECK.slice(1).flatMap((p, i) => interpolate({ yaw: CHECK[i][0], pitch: CHECK[i][1] }, { yaw: p[0], pitch: p[1] }, 10));
const checkCenter = {
  yaw: CHECK.reduce((s, p) => s + p[0], 0) / CHECK.length,
  pitch: CHECK.reduce((s, p) => s + p[1], 0) / CHECK.length,
};
const dimMid = (() => {
  const d = ANCHORS.kitchen_front.dimension;
  return { yaw: d.from.yaw + wrapYaw(d.to.yaw - d.from.yaw) / 2, pitch: (d.from.pitch + d.to.pitch) / 2 };
})();

// 시선을 대상 쪽으로 천천히 돌린다(체크 자리, 아일랜드 자리)
let turnOff = null;
function turnTo(target, ms = 900) {
  turnOff?.();
  const from = { yaw: viewer.yaw, pitch: viewer.pitch };
  const dy = wrapYaw(target.yaw - from.yaw);
  const start = performance.now();
  turnOff = viewer.onFrame((dt, now) => {
    const t = Math.min(1, (now - start) / ms);
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    viewer.setView({ yaw: from.yaw + dy * e, pitch: from.pitch + (target.pitch - from.pitch) * e });
    if (t >= 1) {
      turnOff();
      turnOff = null;
    }
  });
}

// ---------- 주석 ----------
let traceTries = 0;
const annotator = createAnnotator(viewer, sync, {
  onStrokeEnd(stroke) {
    const step = latest && STEP[latest.flow.step];
    if (step?.target !== 'trace') return;
    traceTries += 1;
    const cov = coverage(checkDense, stroke.pts);
    hud.log(`체크 판정: ${Math.round(cov * 100)}% (${traceTries}번째)`);
    if (cov >= TRACE_PASS || traceTries >= TRACE_TRIES) {
      act('trace');
      return;
    }
    traceHint = '점선을 따라 한 번 더 그려 주세요';
    setTimeout(() => sync.send({ type: 'stroke:erase', id: stroke.id }), 700);
  },
});
const annotateBar = buildAnnotateBar($('annotateBar'), {
  onTool: (t) => {
    Object.assign(annotator.state, { tool: t.tool, color: t.color });
    annotateBar.select(t.tool, annotator.state.width);
  },
  onWidth: (w) => {
    annotator.state.width = w;
    annotateBar.select(annotator.state.tool, w);
  },
  onErase: () => annotator.eraseLast(),
});
annotateBar.select(annotator.state.tool, annotator.state.width);
let traceHint = null;

// ---------- 가이드 ----------
const coach = createCoach({ root: $('coach'), hole: $('coachHole'), label: $('coachLabel') });
const dragHint = h('div.drag-hint', {}, h('span.drag-finger'), h('span.drag-text', {}, '화면을 끌어 주방을 둘러보세요'));
dragHint.hidden = true;
document.body.append(dragHint);

/** 가이드 대상 탭 → 서버에 보낸다. 화면은 서버가 확정한 단계로만 바뀐다(서버가 단일 진실) */
let busy = false;
function act(action, value) {
  if (!latest || busy) return;
  sync.send({ type: 'flow', from: latest.flow.step, action, value });
}

document.addEventListener('click', async (e) => {
  const btn = e.target instanceof Element && e.target.closest('[data-target]');
  if (!btn || !coach.allowed(btn) || !latest) return;
  const target = btn.dataset.target;
  if (target === 'hotspot') {
    // 돌리 전환: 화살표 쪽으로 다가간 뒤 다음 공간으로
    const spot = ANCHORS[STEP[latest.flow.step].tablet.pano]?.hotspot;
    busy = true;
    coach.clear();
    await viewer.dolly(spot);
    busy = false;
  }
  act(target, btn.dataset.value);
});

function updateCoach(flow, step) {
  dragHint.hidden = true;
  if (!step.target || busy) return coach.clear();
  if (step.target === 'hotspot') {
    return coach.spatial({
      rect: () => (hotspotEl.hidden ? null : hotspotEl.getBoundingClientRect()),
      text: step.hint,
      match: (el) => el === hotspotEl,
      find: () => [hotspotEl],
    });
  }
  if (step.target === 'trace') {
    const size = 170 * (innerHeight / FRAME_H);
    return coach.spatial({
      rect: () => {
        const s = traceSpot.screen;
        return s ? { left: s.x - size, top: s.y - size, width: size * 2, height: size * 2, right: s.x + size, bottom: s.y + size } : null;
      },
      text: traceHint ?? step.hint,
    });
  }
  if (step.look && !lookDone(flow)) {
    dragHint.hidden = false;
    return coach.clear();
  }
  coach.ui(step.target, step.values, step.hint, { dim: step.target !== 'start' });
}

let stepEnteredLocal = 0;
const lookDone = () => lookAcc >= LOOK_DEG || performance.now() - stepEnteredLocal >= LOOK_MS;

// ---------- 서버 상태 → 화면 ----------
let lastStep = null;
let lastPanelKey = '';
let lastPano = null;

function render(state) {
  const { flow } = state;
  const step = STEP[flow.step];
  const stepChanged = flow.step !== lastStep;
  lastStep = flow.step;
  if (stepChanged) {
    stepEnteredLocal = performance.now();
    lookAcc = 0;
    lastYaw = viewer.yaw;
    traceTries = 0;
    traceHint = null;
  }
  const t = step.tablet;
  const screen = t.screen ?? 'pano';
  const inConsult = stepIndex(flow.step) >= stepIndex('S2-1');

  $('start').hidden = screen !== 'start';
  $('ending').hidden = screen !== 'ending';
  if (screen === 'ending' && stepChanged) renderEnding($('ending'), flow);

  // 캡션
  const cap = step.caption && screen !== 'ending' && screen !== 'start' ? step.caption : null;
  $('caption').hidden = !cap || t.panel === 'loading';
  if (cap) {
    $('caption').dataset.speaker = cap.speaker;
    $('captionSpeaker').textContent = SPEAKERS[cap.speaker];
    $('captionText').textContent = cap.text;
    $('captionNext').hidden = step.target !== 'caption-next';
    $('captionNext').disabled = Boolean(step.look && !lookDone(flow));
  }

  // 상담 화면 크롬
  const chrome = inConsult && screen === 'pano';
  $('tools').hidden = $('nav').hidden = !chrome;
  const panel = t.panel && t.panel !== 'loading' ? t.panel : null;
  $('timer').hidden = !chrome || Boolean(panel);
  for (const b of $('tools').children) {
    const on = (b.dataset.target === 'tool:measure' && t.dims) || (b.dataset.target === 'tool:annotate' && t.annotate) || (b.dataset.target === 'tool:options' && panel === 'options');
    b.setAttribute('aria-pressed', String(Boolean(on)));
  }
  for (const b of $('nav').children) {
    const on = (b.dataset.target === 'nav:ohouse' && (panel === 'ohouse' || panel === 'catalog')) || (b.dataset.target === 'nav:detail' && (panel === 'detail' || panel === 'summary'));
    b.setAttribute('aria-pressed', String(Boolean(on)));
  }

  // 가운데 카드
  $('loading').hidden = t.panel !== 'loading';
  $('card').hidden = !panel;
  const panelKey = `${flow.step}|${flow.choices.island}|${flow.choices.floor}`;
  if (panel && panelKey !== lastPanelKey) {
    const prevTotal = $('cardBody').querySelector('.total')?.textContent;
    renderPanel($('cardBody'), panel, { flow, step });
    const total = $('cardBody').querySelector('.total');
    if (total && prevTotal && prevTotal !== total.textContent) total.classList.add('bump');
  }
  lastPanelKey = panelKey;

  // 주석
  $('annotateBar').hidden = !t.annotate;
  annotator.setEnabled(Boolean(t.annotate));
  look.enabled = !t.annotate;
  if (stepChanged && t.annotate) turnTo(checkCenter);
  if (stepChanged && step.id === 'S2-2b') turnTo(dimMid);

  // 공간 위 표시
  const want = tabletSceneFor(flow);
  const spot = ANCHORS[want.pano]?.hotspot;
  hotspot.set(step.target === 'hotspot' ? spot : null);
  hotspotEl.querySelector('.hotspot-label').textContent = spot?.label ?? '';
  lines.setDimension(t.dims ? ANCHORS.kitchen_front.dimension : null);
  dimLabel.set(t.dims ? dimMid : null);
  lines.setTemplate(t.annotate ? CHECK : null);
  traceSpot.set(t.annotate ? checkCenter : null);
  lines.setStrokes(state.strokes, want.pano);

  // 파노라마: 공간이 바뀌면 정면을 보고 시작
  if (lastPano && want.pano !== lastPano) {
    turnOff?.();
    viewer.setView({ yaw: 0, pitch: -4 });
    viewer.resetZoom();
  }
  lastPano = want.pano;
  player.show(want, { delay: 250 });

  updateCoach(flow, step);
}

// S2-1 둘러보기 '다음' 열림, 타이머 갱신
setInterval(() => {
  if (!latest) return;
  const { flow } = latest;
  const step = STEP[flow.step];
  if (step.look) {
    const done = lookDone(flow);
    if ($('captionNext').disabled === done) {
      $('captionNext').disabled = !done;
      updateCoach(flow, step);
    }
  }
  const elapsed = flow.timerAt ? sync.serverNow() - flow.timerAt : 0;
  timerText.textContent = cardTime.textContent = mmss(elapsed);
}, 200);

let firstSnapshot = true;
sync.on('snapshot', (state, msg) => {
  // 처음 접속·리셋: 서버에 저장된 시점으로 맞춘다 / 재접속: 내 시점을 다시 알려준다
  if (firstSnapshot || msg.reason === 'reset') viewer.setView(state.managerView);
  if (msg.reason === 'reset') {
    lastPano = null;
    viewer.resetZoom(0);
  }
  firstSnapshot = false;
  lastSent = '';
  queueView();
});
sync.on('state', (state) => {
  latest = state;
  render(state);
});
sync.on('info', ({ status }) => document.body.classList.toggle('is-offline', status !== 'online'));
window.__weave = { viewer, sync, get state() { return latest; }, check: CHECK }; // 자동 테스트·디버그용

// ---------- 직원 메뉴: 왼쪽 위 2초 길게 누르기 ----------
let pressTimer = 0;
$('staffZone').addEventListener('pointerdown', () => {
  clearTimeout(pressTimer);
  pressTimer = setTimeout(openStaff, 2000);
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) $('staffZone').addEventListener(type, () => clearTimeout(pressTimer));

let gridOn = false;
function openStaff() {
  const box = h('div.staff-box');
  const close = () => ($('staff').hidden = true);
  const go = (fn) => () => (fn(), close());
  const cur = latest?.flow.step;
  const select = h(
    'select',
    {},
    STEPS.map((s) => h('option', { value: s.id, selected: s.id === cur }, `${s.id} · ${s.caption?.text.slice(0, 22) ?? s.hint ?? ''}`)),
  );
  const neighbour = (d) => STEPS[Math.min(STEPS.length - 1, Math.max(0, stepIndex(cur) + d))].id;
  box.append(
    h('h3', {}, `직원 메뉴 · 지금 ${cur}`),
    h(
      'div.row-btns',
      {},
      h('button', { type: 'button', onclick: go(() => sync.reset()) }, '처음으로(리셋)'),
      h('button', { type: 'button', onclick: go(() => sync.send({ type: 'jump', step: neighbour(-1) })) }, '◀ 이전 단계'),
      h('button', { type: 'button', onclick: go(() => sync.send({ type: 'jump', step: neighbour(1) })) }, '다음 단계 ▶'),
    ),
    h('div.row-btns', {}, select, h('button', { type: 'button', onclick: go(() => sync.send({ type: 'jump', step: select.value })) }, '이 단계로 이동')),
    h(
      'div.row-btns',
      {},
      h('button', { type: 'button', onclick: go(() => hud.toggle()) }, '연결 정보(HUD)'),
      h(
        'button',
        {
          type: 'button',
          onclick: go(() => {
            gridOn = !gridOn;
            viewer.setOverlay(gridOn && player.set ? player.set.gridOverlay() : null);
          }),
        },
        '방위 격자',
      ),
      h('button', { type: 'button', onclick: go(() => sync.simulateDrop(5000)) }, '5초 끊기'),
    ),
    h('div.readout', {}, `화면 중앙 yaw ${viewer.yaw.toFixed(1)}° · pitch ${viewer.pitch.toFixed(1)}°`),
    h('button', { type: 'button', onclick: close }, '닫기'),
  );
  $('staff').textContent = '';
  $('staff').append(box);
  $('staff').hidden = false;
}

// ---------- 90초 무입력 → 확인 10초 → 처음으로 ----------
let lastInput = Date.now();
let idleUntil = 0;
document.addEventListener('pointerdown', () => (lastInput = Date.now()), true);
setInterval(() => {
  const step = latest && STEP[latest.flow.step];
  const idleAllowed = step && step.id !== 'S0-0' && !step.auto && $('staff').hidden;
  if (!idleAllowed) {
    $('idle').hidden = true;
    idleUntil = 0;
    return;
  }
  const now = Date.now();
  if (!idleUntil && now - lastInput > IDLE_MS) {
    idleUntil = now + IDLE_CONFIRM_MS;
    const keep = h('button', { type: 'button', onclick: () => ((idleUntil = 0), (lastInput = Date.now()), ($('idle').hidden = true)) }, '계속 체험하기');
    $('idle').textContent = '';
    $('idle').append(h('div.idle-box', {}, h('h3', {}, '체험을 계속하시겠어요?'), h('p', { id: 'idleCount' }, ''), keep));
    $('idle').hidden = false;
  }
  if (idleUntil) {
    const left = Math.ceil((idleUntil - now) / 1000);
    const count = document.getElementById('idleCount');
    if (count) count.textContent = `${Math.max(0, left)}초 뒤 처음 화면으로 돌아갑니다`;
    if (now >= idleUntil) {
      idleUntil = 0;
      $('idle').hidden = true;
      lastInput = Date.now();
      sync.reset();
    }
  }
}, 500);
