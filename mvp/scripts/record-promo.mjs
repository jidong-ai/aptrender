// 프로모션 영상용 화면 녹화: 태블릿(매니저)과 XR(고객) 화면을 동시에 녹화하고 장면 구간을 기록한다.
//
//   npm run promo:record                 처음부터 S5-2(리포트 수신)까지 녹화
//   npm run promo:record -- --headed     브라우저 창을 띄워서 녹화(GPU를 써서 파노라마가 부드럽다. 최종본 권장)
//   npm run promo:record -- --out=../promo/out
//
// 결과(기본 ../promo/out)
//   raw/tablet.webm · raw/xr.webm   전체 녹화
//   timeline.json                   단계별 시작 시각(초, 각 영상 기준)
//   clips/*.mp4                     영상에 쓰는 구간(태블릿·XR 각각, 1080p H.264). ffmpeg가 있어야 만든다
//
// Playwright가 필요하다. 이 폴더에서 한 번: npm i -D playwright && npx playwright install chromium
// 태블릿은 실제 클릭으로 진행하고(탭 위치에 원이 퍼진다), 김민선의 선택(아일랜드 b·포틀랜드)은 서버 자동 진행에 맡긴다.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { startServer } from '../server/app.js';
import { STEP } from '../src/shared/scenario.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const arg = (name, def) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def;
const HEADED = process.argv.includes('--headed');
const OUT = path.resolve(ROOT, arg('out', '../promo/out'));
const LAST = arg('until', 'S5-2');

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return createRequire(import.meta.url)('playwright'); // 전역 설치(NODE_PATH)도 찾는다
  }
}

// 영상에 쓰는 구간: [시작 단계, 끝 단계(이 단계가 끝날 때까지)]
export const CLIPS = [
  { name: '2-1_moodboard_dimension', from: 'S2-1', to: 'S2-2c' },
  { name: '2-2_propose_choose', from: 'S3-1c', to: 'S3-2b' },
  { name: '2-3_apply_floor', from: 'S4-2c', to: 'S4-3b' },
  { name: 'report', from: 'S5-1', to: 'S5-2' },
];

// 단계마다 읽을 시간(ms). 말풍선은 길게, 버튼만 누르는 단계는 짧게
const DWELL = { caption: 3200, tap: 1500, prologue: null };

const TAP_SCRIPT = `
window.addEventListener('pointerdown', (e) => {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:' + (e.clientX - 30) + 'px;top:' + (e.clientY - 30) + 'px;width:60px;height:60px;border-radius:50%;' +
    'background:rgba(255,255,255,.45);border:3px solid rgba(42,120,214,.95);pointer-events:none;z-index:2147483647;' +
    'transform:scale(.5);opacity:1;transition:transform .5s ease-out,opacity .5s ease-out';
  document.documentElement.appendChild(d);
  requestAnimationFrame(() => requestAnimationFrame(() => { d.style.transform = 'scale(1.5)'; d.style.opacity = '0'; }));
  setTimeout(() => d.remove(), 700);
}, true);`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(path.join(OUT, 'raw'), { recursive: true });
  const server = await startServer({ port: 0, mode: 'dev', quiet: true });
  const base = `http://localhost:${server.port}`;
  console.log(`서버 ${base}`);

  // 진행 상황은 서버 상태를 직접 본다(역할 other: 화면에는 영향 없음)
  let step = null;
  const entered = new Map(); // step → Date.now()
  const watcher = new WebSocket(`${base.replace('http', 'ws')}/ws?role=other`);
  watcher.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    const next = msg.state?.flow?.step ?? (msg.type === 'flow' ? msg.flow.step : null);
    if (next && next !== step) {
      step = next;
      if (!entered.has(step)) entered.set(step, Date.now());
      console.log(`  → ${step}`);
    }
  });
  await new Promise((r) => watcher.once('open', r));
  const waitStep = async (id, timeout = 60_000) => {
    const t0 = Date.now();
    while (step !== id) {
      if (Date.now() - t0 > timeout) throw new Error(`${id}에 도착하지 못했습니다(지금 ${step})`);
      await sleep(50);
    }
  };
  const waitLeave = async (id, timeout = 60_000) => {
    const t0 = Date.now();
    while (step === id) {
      if (Date.now() - t0 > timeout) throw new Error(`${id}에서 넘어가지 못했습니다`);
      await sleep(50);
    }
  };

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: !HEADED,
    args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const mk = async (name, size, url, extra = {}) => {
    const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir: path.join(OUT, 'raw', name), size }, ...extra });
    const startedAt = Date.now();
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'load' });
    return { ctx, page, startedAt };
  };
  const xr = await mk('xr', { width: 1920, height: 1080 }, `${base}/xr?hud=0&sway=0`);
  const tabletCtx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, recordVideo: { dir: path.join(OUT, 'raw', 'tablet'), size: { width: 1180, height: 820 } } });
  await tabletCtx.addInitScript(TAP_SCRIPT);
  const tStarted = Date.now();
  const tp = await tabletCtx.newPage();
  await tp.goto(`${base}/tablet?hud=0`, { waitUntil: 'load' });
  const tablet = { ctx: tabletCtx, page: tp, startedAt: tStarted };
  await sleep(2500); // 첫 화면·파노라마 로딩

  const box = async (sel) => {
    const el = tp.locator(sel).filter({ visible: true }).first();
    await el.waitFor({ state: 'visible', timeout: 15_000 });
    return el;
  };
  const click = async (sel) => {
    const el = await box(sel);
    const b = await el.boundingBox();
    await tp.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    await sleep(250);
    await el.click({ force: true });
  };
  const drag = async (from, to, steps = 40) => {
    await tp.mouse.move(from[0], from[1]);
    await tp.mouse.down();
    await tp.mouse.move(to[0], to[1], { steps });
    await tp.mouse.up();
  };

  // 단계 진행
  while (true) {
    const s = STEP[step];
    if (!s) throw new Error(`알 수 없는 단계 ${step}`);
    const id = s.id;
    if (!s.target || s.chapter === 'prologue') {
      // 자동 진행 단계(프롤로그·로딩·김민선이 고르는 장면)는 그대로 기다린다
      if (id === LAST) break;
      await waitLeave(id, (s.auto ?? 10_000) + 15_000);
      continue;
    }
    const t = s.target;
    await sleep(t === 'caption-next' ? DWELL.caption : DWELL.tap);
    if (id === 'S2-1') {
      // 파노라마를 둘러보는 장면(말풍선 '다음'은 둘러본 뒤 열린다)
      await drag([700, 420], [380, 430], 50);
      await sleep(700);
      await drag([380, 430], [760, 420], 50);
      await sleep(1200);
    }
    if (t === 'trace') {
      const spot = await box('.trace-spot');
      const b = await spot.boundingBox();
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      for (let i = 0; i < 3 && step === id; i++) {
        await tp.mouse.move(cx - 60, cy - 5);
        await tp.mouse.down();
        await tp.mouse.move(cx - 15, cy + 40, { steps: 18 });
        await tp.mouse.move(cx + 70, cy - 55, { steps: 24 });
        await tp.mouse.up();
        await sleep(1200);
      }
    } else if (s.collect) {
      for (const v of s.values) {
        await click(`[data-target="${t}"][data-value="${v}"]`);
        await sleep(1100);
      }
    } else if (s.values) {
      await click(`[data-target="${t}"][data-value="${s.values[0]}"]`);
    } else {
      await click(`[data-target="${t}"]`);
    }
    if (id === LAST) {
      await sleep(4000);
      break;
    }
    await waitLeave(id, 30_000);
  }
  await sleep(1500);

  // 타임라인(초, 영상 기준)
  const rel = (startedAt) => Object.fromEntries([...entered].map(([k, v]) => [k, +((v - startedAt) / 1000).toFixed(2)]));
  const endAt = Date.now();
  const timeline = {
    recordedAt: new Date().toISOString(),
    tablet: { video: 'raw/tablet.webm', size: [1180, 820], steps: rel(tablet.startedAt), end: +((endAt - tablet.startedAt) / 1000).toFixed(2) },
    xr: { video: 'raw/xr.webm', size: [1920, 1080], steps: rel(xr.startedAt), end: +((endAt - xr.startedAt) / 1000).toFixed(2) },
  };

  const vt = tablet.page.video();
  const vx = xr.page.video();
  await tablet.ctx.close();
  await xr.ctx.close();
  await browser.close();
  watcher.close();
  await server.close();
  fs.renameSync(await vt.path(), path.join(OUT, 'raw', 'tablet.webm'));
  fs.renameSync(await vx.path(), path.join(OUT, 'raw', 'xr.webm'));
  for (const d of ['tablet', 'xr']) fs.rmSync(path.join(OUT, 'raw', d), { recursive: true, force: true });

  // 구간 자르기
  const order = Object.keys(timeline.tablet.steps);
  const endOf = (track, id) => {
    const i = order.indexOf(id);
    const nextId = order[i + 1];
    return nextId ? track.steps[nextId] : track.end;
  };
  timeline.clips = [];
  for (const c of CLIPS) {
    if (!(c.from in timeline.tablet.steps) || !(c.to in timeline.tablet.steps)) continue;
    const clip = { name: c.name, from: c.from, to: c.to };
    for (const role of ['tablet', 'xr']) {
      const tr = timeline[role];
      clip[role] = { start: tr.steps[c.from], end: endOf(tr, c.to), file: `clips/${c.name}_${role}.mp4` };
    }
    timeline.clips.push(clip);
  }
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 2));

  let ffmpeg = true;
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  } catch {
    ffmpeg = false;
  }
  if (ffmpeg) {
    fs.mkdirSync(path.join(OUT, 'clips'), { recursive: true });
    for (const clip of timeline.clips) {
      for (const role of ['tablet', 'xr']) {
        const { start, end, file } = clip[role];
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(start), '-to', String(end), '-i', path.join(OUT, timeline[role].video),
          '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-an', path.join(OUT, file)]);
        console.log(`  클립 ${file} (${(end - start).toFixed(1)}초)`);
      }
    }
  } else {
    console.log('ffmpeg가 없어 클립은 만들지 않았습니다. timeline.json의 구간으로 편집 프로그램에서 자르세요.');
  }
  console.log(`완료: ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
