import { WS_PATH, applyChange } from './protocol.js';

const PING_MS = 2000;
const PONG_TIMEOUT_MS = 6000;
const CONNECT_TIMEOUT_MS = 4000;
const BACKOFF_MS = [300, 600, 1200, 2000];

/**
 * 서버와의 WebSocket 연결을 유지하고, 서버 상태의 사본(state)을 들고 있는다.
 * - 접속·재접속할 때마다 서버가 전체 스냅샷을 보내므로, 끊긴 동안의 변경도 그대로 복구된다.
 * - 아이패드 잠금·백그라운드 복귀, 와이파이 재연결 시 자동으로 다시 붙는다.
 *
 * 이벤트: 'state'(state, msg) · 'change'(msg, state) · 'snapshot'(state, msg) · 'info'(info) · 'log'(text)
 */
export function createSync({ role }) {
  const listeners = new Map();
  const emit = (event, ...args) => listeners.get(event)?.forEach((fn) => fn(...args));

  const info = {
    status: 'connecting', // connecting | online | offline | held
    clientId: null,
    rev: null,
    snapshots: 0,
    rtt: null,
    peers: {},
    tabletUrl: null,
    heldUntil: 0,
    clockOffset: 0, // 서버 시계 - 내 시계(ms). 단계 시각·타이머를 서버 기준으로 계산
  };
  const emitInfo = () => emit('info', info);
  const setStatus = (status) => {
    info.status = status;
    emitInfo();
  };
  const log = (text) => emit('log', text);

  let state = null;
  let ws = null;
  let bootId = null;
  let attempt = 0;
  let lastPong = 0;
  let reconnectTimer = 0;
  let connectTimer = 0;
  let pingTimer = 0;

  const isHeld = () => Date.now() < info.heldUntil;

  function schedule(ms) {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, ms);
  }

  function connect() {
    clearTimeout(reconnectTimer);
    if (ws) return;
    if (isHeld()) return schedule(info.heldUntil - Date.now());

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const sock = new WebSocket(`${proto}//${location.host}${WS_PATH}?role=${role}`);
    ws = sock;
    setStatus('connecting');

    connectTimer = setTimeout(() => sock === ws && drop('접속 시간 초과'), CONNECT_TIMEOUT_MS);
    sock.onopen = () => {
      clearTimeout(connectTimer);
      attempt = 0;
      lastPong = Date.now();
      startPing();
    };
    sock.onmessage = (e) => sock === ws && handle(JSON.parse(e.data));
    sock.onclose = () => sock === ws && drop(info.status === 'online' ? '연결 끊김' : null);
  }

  // 현재 소켓을 버리고 재연결을 예약한다. 버린 소켓의 이벤트는 무시된다.
  function drop(reason, delay, code = 1000) {
    const sock = ws;
    ws = null;
    clearTimeout(connectTimer);
    clearInterval(pingTimer);
    if (sock) {
      sock.onopen = sock.onmessage = sock.onclose = null;
      try {
        sock.close(code);
      } catch {}
    }
    if (reason) log(reason);
    setStatus(isHeld() ? 'held' : 'offline');
    schedule(delay ?? BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)]);
  }

  function send(msg) {
    if (!ws || ws.readyState !== WebSocket.OPEN || info.status !== 'online') return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  function startPing() {
    clearInterval(pingTimer);
    let lastTick = Date.now();
    const tick = () => {
      const now = Date.now();
      // 8K 파노라마 디코딩 등으로 페이지 자체가 멈췄던 경우엔 응답이 늦은 게 서버 탓이 아니다 → 다시 기다린다
      if (now - lastTick > PING_MS * 2) lastPong = now;
      lastTick = now;
      if (now - lastPong > PONG_TIMEOUT_MS) return drop('서버 응답 없음');
      ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'ping', t: performance.now() }));
    };
    pingTimer = setInterval(tick, PING_MS);
    tick();
  }

  function handle(msg) {
    switch (msg.type) {
      case 'hello':
        if (bootId !== null && msg.bootId !== bootId) log('서버가 다시 시작됨 (상태 초기화)');
        bootId = msg.bootId;
        info.clientId = msg.id;
        info.tabletUrl = msg.tabletUrl;
        if (typeof msg.now === 'number') info.clockOffset = msg.now - Date.now();
        return;

      case 'snapshot':
        state = msg.state;
        info.rev = msg.rev;
        info.snapshots += 1;
        setStatus('online');
        log(
          msg.reason === 'reset'
            ? `리셋 → 초기 상태 수신 (rev ${msg.rev})`
            : `스냅샷 ${info.snapshots}번째 수신 · 상태 복구 (rev ${msg.rev})`,
        );
        emit('snapshot', state, msg);
        emit('state', state, msg);
        return;

      case 'pong':
        lastPong = Date.now();
        info.rtt = Math.round(performance.now() - msg.t);
        return emitInfo();

      case 'peers':
        info.peers = msg.peers;
        return emitInfo();

      case 'error':
        console.warn('[sync] 서버가 거부:', msg.message);
        return log(`서버 거부: ${msg.message}`);

      default:
        if (!state) return;
        applyChange(state, msg);
        info.rev = msg.rev;
        emit('change', msg, state);
        emit('state', state, msg);
        return emitInfo();
    }
  }

  // 화면 복귀·네트워크 복귀 시: 소켓이 오래 조용했으면 기다리지 않고 바로 다시 붙는다.
  function wake(reason) {
    if (isHeld()) return;
    attempt = 0;
    if (ws?.readyState === WebSocket.OPEN && Date.now() - lastPong > PING_MS * 1.5) return drop(`${reason} → 재연결`, 0);
    if (!ws) connect();
  }
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && wake('화면 복귀'));
  window.addEventListener('pageshow', (e) => e.persisted && wake('페이지 복원'));
  window.addEventListener('online', () => wake('네트워크 복귀'));

  connect();

  return {
    info,
    get state() {
      return state;
    },
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event).delete(fn);
    },
    send,
    /** 서버 시계 기준 지금(ms) */
    serverNow: () => Date.now() + info.clockOffset,
    patch: (patch) => send({ type: 'patch', patch }),
    reset: () => send({ type: 'reset' }),
    /** 재접속 테스트: 지금 연결을 끊고 ms 동안 다시 붙지 않는다. */
    simulateDrop(ms = 5000) {
      info.heldUntil = Date.now() + ms;
      drop(`테스트: ${ms / 1000}초간 연결 끊기`, ms, 4001);
    },
  };
}
