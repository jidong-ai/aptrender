// 바닥재 선택 영역 편집기(/mask): 파노라마 평면 이미지 위에 다각형을 그려 masks/{장면}_floor.svg로 저장한다.
// 같은 영역이 ① 옵션수정의 파란 '선택 영역' ② 바닥재 렌더를 잘라 낸 레이어 에 쓰인다
import 'pretendard/dist/web/variable/pretendardvariable.css';
import { FLOOR_AREA, LAYERS, PANOS } from '../shared/scene.js';
import { maskPoints, maskSvg } from '../shared/floor-mask.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv');
const g = cv.getContext('2d');
const HIT = 9; // 점·선을 잡는 거리(px)

const { panos = {}, masks = {} } = await (await fetch('/api/panos')).json();
// 바닥재 레이어가 정의된 장면만(정면·측면)
const scenes = Object.keys(PANOS).filter((id) => Object.values(LAYERS).some((l) => l.kind === 'floor' && l.pano === id));
const pick = (sizes) => sizes?.['4k'] ?? sizes?.['8k'] ?? null;
const floorRender = (pano) => {
  const id = Object.entries(LAYERS).find(([k, l]) => l.kind === 'floor' && l.pano === pano && panos[k])?.[0];
  return id ? { id, url: pick(panos[id]) } : null;
};
for (const id of scenes) $('pano').append(new Option(`${PANOS[id].name} (${id})`, id));
const params = new URLSearchParams(location.search);
if (scenes.includes(params.get('pano'))) $('pano').value = params.get('pano');

let pano = $('pano').value;
let points = [];
let undoStack = [];
let base = null; // 배경 렌더
let floor = null; // 바닥재 렌더
let legacy = null; // Figma로 그린 마스크(점으로 못 읽음) 그림
let mode = 'area';
let dragging = -1;
let dirty = false;

const load = (url) =>
  new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

function status(text, kind = '') {
  $('status').textContent = text ? ` — ${text}` : '';
  $('status').className = kind;
}

async function open(id) {
  pano = id;
  undoStack = [];
  dirty = false;
  legacy = null;
  status('불러오는 중…');
  const fr = floorRender(id);
  [base, floor] = await Promise.all([load(pick(panos[id])), load(fr?.url)]);
  points = FLOOR_AREA[id]?.map((p) => [...p]) ?? [];
  const url = masks[`${id}_floor`];
  if (url) {
    const text = url.includes('.svg') ? await (await fetch(url)).text() : '';
    const pts = maskPoints(text);
    if (pts) points = pts;
    else {
      legacy = await load(url);
      points = [];
    }
  }
  status(
    !base
      ? `${id} 렌더가 없습니다`
      : legacy
        ? 'Figma 등에서 그린 마스크가 있습니다(회색). 새로 그려 저장하면 대체됩니다'
        : !fr
          ? '바닥재 렌더가 아직 없어 영역만 그릴 수 있습니다'
          : url
            ? '저장된 영역을 불러왔습니다'
            : '저장된 영역이 없어 기본 영역(FLOOR_AREA)으로 시작합니다',
  );
  $('mode').querySelector('[data-mode="floor"]').disabled = !floor;
  $('mode').querySelector('[data-mode="preview"]').disabled = !floor;
  if (!floor && mode !== 'area') setMode('area');
  layout();
}

function layout() {
  const z = Number($('zoom').value);
  const w = Math.max(600, (document.documentElement.clientWidth - 32) * z);
  const dpr = devicePixelRatio || 1;
  cv.style.width = `${w}px`;
  cv.style.height = `${w / 2}px`;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round((w / 2) * dpr);
  draw();
}

const W = () => cv.width;
const H = () => cv.height;
const toPx = ([u, v]) => [u * W(), v * H()];

function polygon() {
  g.beginPath();
  points.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](...toPx(p)));
  g.closePath();
}

function draw() {
  const dpr = devicePixelRatio || 1;
  g.clearRect(0, 0, W(), H());
  const bg = mode === 'floor' ? floor : base;
  if (bg) g.drawImage(bg, 0, 0, W(), H());
  else {
    g.fillStyle = '#333';
    g.fillRect(0, 0, W(), H());
  }
  if (legacy && !points.length) {
    g.globalAlpha = 0.45;
    g.drawImage(legacy, 0, 0, W(), H());
    g.globalAlpha = 1;
  }
  if (points.length >= 3 && mode === 'preview' && floor) {
    g.save();
    polygon();
    g.clip();
    g.drawImage(floor, 0, 0, W(), H());
    g.restore();
  } else if (points.length >= 3) {
    polygon();
    g.fillStyle = 'rgb(26 160 255 / 0.32)';
    g.fill();
  }
  if (points.length) {
    polygon();
    g.lineWidth = 2 * dpr;
    g.strokeStyle = '#1aa0ff';
    g.stroke();
    points.forEach((p, i) => {
      const [x, y] = toPx(p);
      g.beginPath();
      g.arc(x, y, (i === dragging ? 7 : 5) * dpr, 0, Math.PI * 2);
      g.fillStyle = i === 0 ? '#ffcc33' : '#fff';
      g.fill();
      g.lineWidth = 2 * dpr;
      g.strokeStyle = '#1aa0ff';
      g.stroke();
    });
  }
  $('save').disabled = points.length < 3;
  $('download').disabled = points.length < 3;
}

function eventUV(e) {
  const r = cv.getBoundingClientRect();
  return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
}

function hitPoint(e) {
  const r = cv.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  return points.findIndex(([u, v]) => Math.hypot(u * r.width - x, v * r.height - y) <= HIT);
}

// 클릭한 곳에 가장 가까운 변(점 i와 i+1 사이)과 거리(px)
function nearestEdge(e) {
  const r = cv.getBoundingClientRect();
  const px = e.clientX - r.left;
  const py = e.clientY - r.top;
  let best = { i: -1, d: Infinity };
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = [points[i][0] * r.width, points[i][1] * r.height];
    const b = points[(i + 1) % points.length];
    const [bx, by] = [b[0] * r.width, b[1] * r.height];
    const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)));
    const d = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
    if (d < best.d) best = { i, d };
  }
  return best;
}

const snapshot = () => {
  undoStack.push(points.map((p) => [...p]));
  if (undoStack.length > 100) undoStack.shift();
  dirty = true;
};

cv.addEventListener('pointerdown', (e) => {
  const hit = hitPoint(e);
  if (hit >= 0 && e.altKey) {
    snapshot();
    points.splice(hit, 1);
    return draw();
  }
  if (hit >= 0) {
    snapshot();
    dragging = hit;
    cv.setPointerCapture(e.pointerId);
    return draw();
  }
  snapshot();
  const edge = points.length >= 3 ? nearestEdge(e) : { i: -1, d: Infinity };
  if (edge.d <= HIT) points.splice(edge.i + 1, 0, eventUV(e));
  else points.push(eventUV(e));
  draw();
});
cv.addEventListener('pointermove', (e) => {
  if (dragging < 0) {
    cv.style.cursor = hitPoint(e) >= 0 ? 'grab' : 'crosshair';
    return;
  }
  points[dragging] = eventUV(e);
  draw();
});
const endDrag = () => {
  dragging = -1;
  draw();
};
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('dblclick', (e) => {
  const hit = hitPoint(e);
  if (hit < 0) return;
  // 더블클릭 앞의 두 번 클릭으로 생긴 변화를 되돌린 뒤 점을 지운다
  undoStack.pop();
  undoStack.pop();
  snapshot();
  points.splice(hit, 1);
  draw();
});

function setMode(m) {
  mode = m;
  for (const b of $('mode').children) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
  draw();
}
$('mode').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (b && !b.disabled) setMode(b.dataset.mode);
});
$('zoom').addEventListener('change', layout);
addEventListener('resize', layout);
$('undo').addEventListener('click', () => {
  if (!undoStack.length) return;
  points = undoStack.pop();
  draw();
});
$('clear').addEventListener('click', () => {
  snapshot();
  points = [];
  draw();
});
$('reset').addEventListener('click', () => {
  snapshot();
  points = FLOOR_AREA[pano]?.map((p) => [...p]) ?? [];
  draw();
});
$('pano').addEventListener('change', () => {
  if (dirty && !confirm('저장하지 않은 영역이 있습니다. 장면을 바꿀까요?')) {
    $('pano').value = pano;
    return;
  }
  window.history.replaceState(null, '', `?pano=${$('pano').value}`);
  open($('pano').value);
});
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
    e.preventDefault();
    $('undo').click();
  }
});
addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});

$('download').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([maskSvg(points)], { type: 'image/svg+xml' }));
  a.download = `${pano}_floor.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('save').addEventListener('click', async () => {
  $('save').disabled = true;
  status('저장하고 바닥재 레이어를 다시 만드는 중… (몇 초)');
  try {
    const res = await fetch(`/api/masks/${pano}`, { method: 'POST', headers: { 'Content-Type': 'image/svg+xml' }, body: maskSvg(points) });
    const body = await res.json();
    if (!body.ok) throw new Error(body.error);
    dirty = false;
    status(body.prep?.ok === false ? `저장했지만 레이어를 다시 만들지 못했습니다: ${body.prep.log}` : '저장했습니다. 태블릿·아이맥을 새로고침하면 반영됩니다', body.prep?.ok === false ? 'err' : 'ok');
  } catch (err) {
    status(`저장 실패: ${err.message}. 'SVG 내려받기'로 받은 파일을 assets/pano/masks/에 넣어도 됩니다`, 'err');
  }
  draw();
});

open(pano);
