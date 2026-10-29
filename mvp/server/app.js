import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sirv from 'sirv';
import { WebSocketServer } from 'ws';
import {
  WS_PATH,
  applyChange,
  createInitialState,
  sanitizePatch,
  sanitizePts,
  sanitizeStroke,
} from '../src/shared/protocol.js';
import { CUT_PLACE, PANOS, parsePanoFile, placedRect } from '../src/shared/scene.js';
import { isSafeMaskSvg } from '../src/shared/floor-mask.js';
import { execFile } from 'node:child_process';
import { STAT_KEYS, STEP, clearsStrokes, jumpFlow, nextStep } from '../src/shared/scenario.js';
import { effectiveAuto } from '../src/shared/voice.js';
import { getLanAddresses } from './lan.js';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = path.join(ROOT, 'dist');
const ASSETS = path.join(ROOT, 'assets');
const PANO_DIR = path.join(ASSETS, 'pano');
const AUDIO_DIR = path.join(ASSETS, 'audio');

// assets/pano(원본)와 assets/pano/built(pano:prep 결과)를 훑어 실제로 있는 파노라마 목록을 만든다.
// 이름 규칙은 src/shared/scene.js. 같은 장면·크기가 여럿이면 built의 JPG → 원본 JPG → PNG 순으로 쓴다.
export function listPanos(dir = PANO_DIR) {
  const panos = {};
  const rank = (rel) => (rel.startsWith('built/') ? 0 : /\.png$/i.test(rel) ? 2 : 1);
  for (const sub of ['built', '']) {
    let files = [];
    try {
      files = fs.readdirSync(path.join(dir, sub), { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name);
    } catch {}
    for (const file of files.sort()) {
      const parsed = parsePanoFile(file);
      if (!parsed || parsed.cut) continue; // 누끼는 레이어 재료라 목록에 넣지 않는다
      const rel = sub ? `${sub}/${file}` : file;
      const entry = (panos[parsed.id] ??= {});
      const prev = entry[parsed.size];
      if (prev && rank(prev.replace('/assets/pano/', '')) <= rank(rel)) continue;
      entry[parsed.size] = `/assets/pano/${rel.split('/').map(encodeURIComponent).join('/')}`;
    }
  }
  return panos;
}

// npm run pano:prep이 만든 레이어 목록(assets/pano/built/layers/manifest.json). 파일이 실제로 있는 것만
export function listLayers(dir = PANO_DIR) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, 'built', 'layers', 'manifest.json'), 'utf8'));
  } catch {
    return {};
  }
  const layers = {};
  for (const [key, layer] of Object.entries(manifest.layers ?? {})) {
    const files = {};
    for (const [size, rel] of Object.entries(layer.files ?? {})) {
      if (fs.existsSync(path.join(dir, rel))) files[size] = `/assets/pano/${rel.split('/').map(encodeURIComponent).join('/')}`;
    }
    // 자리를 지정한 누끼는 지금의 CUT_PLACE로 다시 계산한다(값만 바꾸고 pano:prep을 안 돌려도 반영되게).
    // 예전 manifest에 aspect가 없으면 만들 때의 사각형에서 가로세로비를 거꾸로 구한다
    let rect = layer.rect;
    if (CUT_PLACE[key] && rect) rect = placedRect(CUT_PLACE[key], layer.aspect ?? (2 * (rect[2] - rect[0])) / (rect[3] - rect[1]));
    if (Object.keys(files).length) layers[key] = { kind: layer.kind, rect, files };
  }
  return layers;
}

// 음성 가이드·BGM 목록(npm run audio:gen이 만든 assets/audio/manifest.json).
// 길이(ms)는 파일이 없어도(--dry 추정치) 넘겨 자동 진행 시간에 쓰고, url은 파일이 실제로 있을 때만 붙인다
export function listAudio(dir = AUDIO_DIR) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  } catch {
    return { voice: {}, bgm: {} };
  }
  const entry = (e) => {
    if (!e || typeof e.ms !== 'number') return null;
    const ok = e.file && fs.existsSync(path.join(dir, e.file));
    // ?v=해시: 다시 만들면 브라우저가 예전 파일을 캐시에서 쓰지 않게
    return { ms: e.ms, url: ok ? `/assets/audio/${e.file.split('/').map(encodeURIComponent).join('/')}?v=${String(e.hash ?? '').slice(0, 8)}` : null };
  };
  const pick = (obj) => Object.fromEntries(Object.entries(obj ?? {}).map(([k, e]) => [k, entry(e)]).filter(([, e]) => e));
  return { voice: pick(manifest.voice), bgm: pick(manifest.bgm) };
}

// 바닥재 적용 영역 마스크(Figma 펜툴로 그려 내보낸 파일): assets/pano/masks/{장면}_floor.svg|png
/** 바닥 영역 마스크 저장(마스크 편집기 /mask). 같은 이름 파일을 덮어쓴다 */
export function saveMask(pano, svg, dir = PANO_DIR) {
  if (!PANOS[pano]) throw new Error(`알 수 없는 장면: ${pano}`);
  if (!isSafeMaskSvg(svg)) throw new Error('마스크 SVG 형식이 아닙니다');
  fs.mkdirSync(path.join(dir, 'masks'), { recursive: true });
  for (const ext of ['png']) fs.rmSync(path.join(dir, 'masks', `${pano}_floor.${ext}`), { force: true }); // 예전 PNG가 SVG보다 앞서지 않게
  fs.writeFileSync(path.join(dir, 'masks', `${pano}_floor.svg`), svg);
}

// 마스크를 바꾼 뒤 바닥재 레이어를 다시 자른다(npm run pano:prep). 한 번에 하나씩
let prepRun = Promise.resolve();
function runPrep() {
  prepRun = prepRun.then(
    () =>
      new Promise((resolve) => {
        execFile(process.execPath, [path.join(ROOT, 'scripts', 'prep-pano.mjs')], { cwd: ROOT, timeout: 120_000 }, (err, stdout, stderr) =>
          resolve({ ok: !err, log: `${stdout}${stderr}`.trim().split('\n').slice(-6).join('\n') }),
        );
      }),
  );
  return prepRun;
}

export function listMasks(dir = PANO_DIR) {
  const masks = {};
  let files = [];
  try {
    files = fs.readdirSync(path.join(dir, 'masks'));
  } catch {}
  for (const file of files.sort()) {
    const m = /^([a-z0-9_]+)\.(svg|png)$/i.exec(file);
    // ?v=수정 시각: 편집기로 다시 저장하면 화면이 예전 마스크를 캐시에서 쓰지 않게
    if (m) masks[m[1].toLowerCase()] = `/assets/pano/masks/${encodeURIComponent(file)}?v=${Math.round(fs.statSync(path.join(dir, 'masks', file)).mtimeMs)}`;
  }
  return masks;
}

const PAGES = { '/': 'index.html', '/tablet': 'tablet.html', '/xr': 'xr.html', '/mask': 'mask.html' };
const ROLES = ['tablet', 'xr'];
const HEARTBEAT_MS = 10_000;

const time = () => new Date().toTimeString().slice(0, 8); // HH:MM:SS
const CLOSE_REASONS = { 1000: '정상 종료', 1001: '페이지 닫힘', 1005: '끊김', 1006: '비정상 끊김', 4001: '재접속 테스트' };

/**
 * mode
 *  - 'dev'  : Vite 미들웨어(코드 수정 시 자동 새로고침)
 *  - 'prod' : `npm run build` 결과(dist/)를 그대로 서빙. 전시용
 *  - 'api'  : 페이지 없이 WebSocket만 (테스트용)
 */
export async function startServer({ port = 3000, mode = 'dev', quiet = false, audioDir = AUDIO_DIR } = {}) {
  const log = quiet ? () => {} : (...args) => console.log(`[${time()}]`, ...args);

  // ---------- 상태 (서버가 단일 진실) ----------
  const bootId = Date.now();
  let state = createInitialState();
  let rev = 0;
  let nextClientId = 1;
  const clients = new Map(); // ws -> { id, role, addr }

  // ---------- HTTP ----------
  const httpServer = http.createServer();
  let vite = null;
  let app = null;

  if (mode === 'dev') {
    const { createServer } = await import('vite');
    vite = await createServer({
      root: ROOT,
      configFile: path.join(ROOT, 'vite.config.js'),
      appType: 'custom',
      server: { middlewareMode: true, ws: { server: httpServer } }, // HMR도 3000 포트 공유
    });
    app = vite.middlewares; // /src, /assets 등 나머지 파일은 Vite가 서빙
  } else if (mode === 'prod') {
    if (!fs.existsSync(path.join(DIST, 'tablet.html'))) {
      throw Object.assign(new Error('dist/ 가 없습니다. `npm run build`를 먼저 실행하세요.'), { code: 'NO_DIST' });
    }
    const serveDist = sirv(DIST, {
      etag: true,
      setHeaders: (res, pathname) =>
        res.setHeader('Cache-Control', pathname.startsWith('/static/') ? 'public,max-age=31536000,immutable' : 'no-cache'),
    });
    // dev:true = 서버 실행 중에 파노라마를 추가해도 바로 서빙
    const serveAssets = sirv(ASSETS, { dev: true, etag: true });
    app = (req, res, next) => {
      const { pathname } = new URL(req.url, 'http://local');
      if (!pathname.startsWith('/assets/')) return serveDist(req, res, next);
      req.url = pathname.slice('/assets'.length);
      return serveAssets(req, res, next);
    };
  }

  async function sendPage(file, req, res) {
    let html;
    if (vite) {
      html = await fs.promises.readFile(path.join(ROOT, file), 'utf8');
      html = await vite.transformIndexHtml(req.url, html);
    } else {
      html = await fs.promises.readFile(path.join(DIST, file), 'utf8');
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(html);
  }

  httpServer.on('request', (req, res) => {
    const notFound = () => {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    };
    let pathname;
    try {
      pathname = new URL(req.url, 'http://local').pathname;
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (pathname === '/api/panos') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({ panos: listPanos(), layers: listLayers(), masks: listMasks() }));
      return;
    }
    if (pathname === '/api/audio') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(listAudio(audioDir)));
      return;
    }
    // 마스크 편집기 저장: 이 컴퓨터(맥북·아이맥)에서 연 편집기만 받는다
    const maskSave = /^\/api\/masks\/([a-z0-9_]+)$/.exec(pathname);
    if (maskSave && req.method === 'POST') {
      const json = (code, body) => {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify(body));
      };
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      if (!local) return json(403, { ok: false, error: '마스크는 서버를 켠 컴퓨터에서만 저장할 수 있습니다' });
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 600_000) req.destroy();
      });
      req.on('end', async () => {
        try {
          saveMask(maskSave[1], body);
          log(`바닥 영역 마스크 저장: ${maskSave[1]}_floor.svg → 레이어 다시 만드는 중`);
          const prep = mode === 'api' ? { ok: true, log: '' } : await runPrep();
          log(prep.ok ? '바닥재 레이어 갱신 완료' : `레이어 갱신 실패\n${prep.log}`);
          json(200, { ok: true, prep });
        } catch (err) {
          json(400, { ok: false, error: err.message });
        }
      });
      return;
    }
    if (pathname === '/api/ui') {
      // Figma에서 받은 UI 에셋 목록(assets/ui/figma). 없는 파일은 화면이 와이어프레임 아이콘으로 대신한다
      let files = [];
      try {
        files = fs.readdirSync(path.join(ASSETS, 'ui', 'figma')).filter((f) => !f.startsWith('.'));
      } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({ files }));
      return;
    }
    const page = PAGES[pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname];
    if (page && mode !== 'api') {
      sendPage(page, req, res).catch((err) => {
        vite?.ssrFixStacktrace(err);
        console.error(err);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(String(err.message));
      });
      return;
    }
    if (app) return app(req, res, notFound);
    notFound();
  });

  // ---------- WebSocket 중계 ----------
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://local');
    if (pathname === WS_PATH) {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    } else if (!vite) {
      socket.destroy(); // dev 모드에선 Vite HMR 소켓이 따로 처리
    }
  });

  const send = (ws, msg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };
  const broadcast = (msg) => {
    const data = JSON.stringify(msg);
    for (const ws of clients.keys()) if (ws.readyState === ws.OPEN) ws.send(data);
  };
  const peerCounts = () => {
    const counts = Object.fromEntries(ROLES.map((r) => [r, 0]));
    for (const c of clients.values()) if (c.role in counts) counts[c.role] += 1;
    return counts;
  };
  const peerSummary = () => {
    const p = peerCounts();
    return `태블릿 ${p.tablet} · XR ${p.xr}`;
  };
  const tabletUrl = () => {
    const [lan] = getLanAddresses();
    return lan ? `http://${lan.address}:${port}/tablet` : null;
  };

  // ---------- 가이드 플로우 ----------
  // 자동으로 넘어가는 단계(로딩·엔딩)는 서버가 시간을 잰다. 재접속해도 같은 시점에 넘어간다.
  // 음성 가이드가 러닝타임보다 길면 음성이 끝날 때까지 기다린다(manifest는 매번 읽어 다시 만들어도 바로 반영)
  let autoTimer = 0;
  function armAuto() {
    clearTimeout(autoTimer);
    const step = STEP[state.flow.step];
    if (!step.auto) return;
    const wait = Math.max(0, state.flow.enteredAt + effectiveAuto(step, listAudio(audioDir)) - Date.now());
    const from = step.id;
    autoTimer = setTimeout(() => advance(null, { from, action: 'auto' }), wait);
  }

  function resetAll(who, reason = 'reset') {
    state = createInitialState();
    rev += 1;
    broadcast({ type: 'snapshot', rev, state, reason });
    armAuto();
    log(`${who} → ${reason} (rev ${rev})`);
  }

  // client = null이면 서버 자신(자동 진행)
  function advance(client, msg) {
    const who = client ? `${client.role}#${client.id}` : 'server';
    const result = nextStep(state.flow, msg);
    if (result.error) return result.error;
    if (result.reset) {
      resetAll(who);
      return null;
    }
    commit(client ?? { id: 0 }, { type: 'flow', flow: result.flow });
    // 단계가 끝나면서 지워야 할 주석(예: 아일랜드를 놓으면 900mm 체크 표시)
    if (STEP[msg.from].clearStrokes) {
      for (const s of [...state.strokes]) commit({ id: 0 }, { type: 'stroke:erase', id: s.id });
    }
    armAuto();
    log(`${who} → ${msg.action}${msg.value ? `(${msg.value})` : ''} · ${msg.from} → ${result.flow.step} (rev ${rev})`);
    return null;
  }

  function commit(client, change) {
    if (!applyChange(state, change)) return false;
    rev += 1;
    broadcast({ ...change, rev, from: client.id });
    return true;
  }

  function describePatch(patch) {
    return Object.entries(patch)
      .filter(([key]) => key !== 'managerView') // 10Hz로 들어오므로 로그 생략
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');
  }

  function handleMessage(ws, client, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return send(ws, { type: 'error', message: 'JSON 형식이 아닙니다.' });
    }
    const who = `${client.role}#${client.id}`;
    const reject = (message) => {
      log(`! ${who} ${msg.type} 거부: ${message}`);
      send(ws, { type: 'error', message });
    };

    switch (msg?.type) {
      case 'ping':
        return send(ws, { type: 'pong', t: msg.t });

      case 'sync':
        return send(ws, { type: 'snapshot', rev, state });

      case 'patch': {
        const { patch, rejected } = sanitizePatch(msg.patch);
        if (rejected.length) reject(`허용되지 않는 키/값: ${rejected.join(', ')}`);
        if (!Object.keys(patch).length) return;
        commit(client, { type: 'patch', patch });
        const text = describePatch(patch);
        if (text) log(`${who} → ${text} (rev ${rev})`);
        return;
      }

      case 'stroke:start': {
        const stroke = sanitizeStroke(msg.stroke);
        if (!stroke) return reject('stroke 형식이 올바르지 않습니다.');
        if (!commit(client, { type: 'stroke:start', stroke })) return reject(`stroke ${stroke.id}를 추가할 수 없습니다.`);
        return log(`${who} → stroke:start ${stroke.id} (${stroke.tool})`);
      }

      case 'stroke:append': {
        const pts = sanitizePts(msg.pts);
        if (typeof msg.id !== 'string' || !pts) return reject('stroke:append 형식이 올바르지 않습니다.');
        commit(client, { type: 'stroke:append', id: msg.id, pts });
        return;
      }

      case 'stroke:end':
      case 'stroke:erase': {
        if (typeof msg.id !== 'string') return reject(`${msg.type}에 id가 없습니다.`);
        if (commit(client, { type: msg.type, id: msg.id })) log(`${who} → ${msg.type} ${msg.id}`);
        return;
      }

      case 'flow': {
        if (typeof msg.from !== 'string' || typeof msg.action !== 'string' || msg.action === 'auto') return reject('flow 형식이 올바르지 않습니다.');
        const error = advance(client, { from: msg.from, action: msg.action, value: typeof msg.value === 'string' ? msg.value : undefined });
        if (error) reject(error);
        return;
      }

      case 'stat': {
        // 엔딩 보상용 기록: 헛탭(misses), 체크 시도(traceTries)
        if (!STAT_KEYS.includes(msg.key)) return reject(`알 수 없는 stat: ${msg.key}`);
        const flow = structuredClone(state.flow);
        flow.stats = { misses: 0, traceTries: 0, ...flow.stats };
        flow.stats[msg.key] += 1;
        commit(client, { type: 'flow', flow });
        return;
      }

      case 'jump': {
        const flow = typeof msg.step === 'string' && jumpFlow(state.flow, msg.step);
        if (!flow) return reject(`알 수 없는 단계: ${msg.step}`);
        state.flow = flow;
        if (clearsStrokes(flow.step)) state.strokes = [];
        rev += 1;
        broadcast({ type: 'snapshot', rev, state, reason: 'jump' });
        armAuto();
        return log(`${who} → jump ${flow.step} (rev ${rev})`);
      }

      case 'reset':
        return resetAll(who);

      default:
        return reject(`알 수 없는 메시지: ${msg?.type}`);
    }
  }

  wss.on('connection', (ws, req) => {
    const role = new URL(req.url, 'http://local').searchParams.get('role');
    const client = {
      id: nextClientId++,
      role: ROLES.includes(role) ? role : 'other',
      addr: (req.socket.remoteAddress ?? '').replace(/^::ffff:/, ''),
    };
    clients.set(ws, client);
    ws.isAlive = true;

    // 접속·재접속 모두 같은 순서: hello → 전체 스냅샷
    send(ws, { type: 'hello', id: client.id, role: client.role, bootId, now: Date.now(), tabletUrl: tabletUrl() });
    send(ws, { type: 'snapshot', rev, state });
    broadcast({ type: 'peers', peers: peerCounts() });
    log(`+ ${client.role}#${client.id} 접속 (${client.addr}) · ${peerSummary()}`);

    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('message', (data) => handleMessage(ws, client, data.toString()));
    ws.on('close', (code) => {
      clients.delete(ws);
      broadcast({ type: 'peers', peers: peerCounts() });
      log(`- ${client.role}#${client.id} 연결 끊김 (${CLOSE_REASONS[code] ?? `code ${code}`}) · ${peerSummary()}`);
    });
    ws.on('error', () => {});
  });

  // 응답 없는 소켓 정리(아이패드 잠금, 와이파이 끊김 등)
  const heartbeat = setInterval(() => {
    for (const ws of clients.keys()) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });
  port = httpServer.address().port;

  async function close() {
    clearInterval(heartbeat);
    clearTimeout(autoTimer);
    for (const ws of clients.keys()) ws.close(1001, 'server shutdown');
    wss.close();
    await vite?.close();
    const closed = new Promise((resolve) => httpServer.close(resolve));
    httpServer.closeAllConnections();
    await closed;
  }

  return { port, mode, close, getState: () => state };
}
