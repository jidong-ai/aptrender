import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { listPanos, startServer } from '../server/app.js';

let server;
before(async () => {
  server = await startServer({ port: 0, mode: 'api', quiet: true });
});
after(() => server.close());

// 메시지를 큐에 쌓아 두고, 조건에 맞는 메시지를 순서대로 꺼내 쓰는 테스트용 클라이언트
function connect(role) {
  const ws = new WebSocket(`ws://localhost:${server.port}/ws?role=${role}`);
  const queue = [];
  const waiters = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    const i = waiters.findIndex((w) => w.match(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else queue.push(msg);
  });
  return {
    ws,
    send: (msg) => ws.send(JSON.stringify(msg)),
    next(type, pred = () => true) {
      const match = (m) => m.type === type && pred(m);
      const i = queue.findIndex(match);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${role}: '${type}' 메시지를 받지 못함`)), 2000);
        waiters.push({ match, resolve: (m) => (clearTimeout(timer), resolve(m)) });
      });
    },
    close: () => new Promise((resolve) => (ws.once('close', resolve), ws.close())),
  };
}

test('접속하면 hello와 전체 스냅샷을 받는다', async () => {
  const xr = connect('xr');
  const hello = await xr.next('hello');
  assert.equal(hello.role, 'xr');
  const snap = await xr.next('snapshot');
  assert.equal(snap.state.preset, 'white');
  assert.deepEqual(snap.state.strokes, []);
  await xr.close();
});

test('태블릿의 patch가 XR에 중계된다', async () => {
  const tablet = connect('tablet');
  const xr = connect('xr');
  await Promise.all([tablet.next('snapshot'), xr.next('snapshot')]);

  tablet.send({ type: 'patch', patch: { preset: 'B' } });
  const msg = await xr.next('patch');
  assert.deepEqual(msg.patch, { preset: 'B' });
  assert.equal(server.getState().preset, 'B');

  await Promise.all([tablet.close(), xr.close()]);
});

test('허용되지 않은 값은 반영하지 않고 error로 알린다', async () => {
  const tablet = connect('tablet');
  const { state } = await tablet.next('snapshot');
  tablet.send({ type: 'patch', patch: { preset: 'Z', strokes: [] } });
  const err = await tablet.next('error');
  assert.match(err.message, /preset/);
  assert.match(err.message, /strokes/);
  assert.equal(server.getState().preset, state.preset);
  await tablet.close();
});

test('끊긴 동안 바뀐 상태를 재접속 스냅샷으로 받는다', async () => {
  const tablet = connect('tablet');
  let xr = connect('xr');
  await Promise.all([tablet.next('snapshot'), xr.next('snapshot')]);
  tablet.send({ type: 'patch', patch: { preset: 'A' } });
  await xr.next('patch');

  await xr.close(); // XR 끊김
  tablet.send({ type: 'patch', patch: { preset: 'C', light: 'warm3000' } });
  await tablet.next('patch', (m) => m.patch.preset === 'C');

  xr = connect('xr'); // XR 재접속
  const snap = await xr.next('snapshot');
  assert.equal(snap.state.preset, 'C');
  assert.equal(snap.state.light, 'warm3000');

  await Promise.all([tablet.close(), xr.close()]);
});

test('주석 stroke 시작·추가·종료·삭제가 상태와 중계에 반영된다', async () => {
  const tablet = connect('tablet');
  const xr = connect('xr');
  await Promise.all([tablet.next('snapshot'), xr.next('snapshot')]);

  const stroke = { id: 't-1', tool: 'pen', width: 2, color: '#ff3b30', pts: [[10, 5]] };
  tablet.send({ type: 'stroke:start', stroke });
  assert.deepEqual((await xr.next('stroke:start')).stroke, stroke);

  tablet.send({ type: 'stroke:append', id: 't-1', pts: [[11, 5], [12, 6]] });
  await xr.next('stroke:append');
  tablet.send({ type: 'stroke:end', id: 't-1' });
  await xr.next('stroke:end');
  assert.deepEqual(server.getState().strokes[0].pts, [[10, 5], [11, 5], [12, 6]]);

  tablet.send({ type: 'stroke:erase', id: 't-1' });
  await xr.next('stroke:erase');
  assert.equal(server.getState().strokes.length, 0);

  await Promise.all([tablet.close(), xr.close()]);
});

test('reset은 모든 화면에 초기 상태 스냅샷을 보낸다', async () => {
  const tablet = connect('tablet');
  const xr = connect('xr');
  await Promise.all([tablet.next('snapshot'), xr.next('snapshot')]);
  tablet.send({ type: 'patch', patch: { preset: 'B', dims: true } });
  await xr.next('patch');

  tablet.send({ type: 'reset' });
  const snap = await xr.next('snapshot', (m) => m.reason === 'reset');
  assert.equal(snap.state.preset, 'white');
  assert.equal(snap.state.dims, false);

  await Promise.all([tablet.close(), xr.close()]);
});

test('접속 기기 수(peers)를 알려준다', async () => {
  const tablet = connect('tablet');
  await tablet.next('snapshot');
  const xr = connect('xr');
  const peers = await tablet.next('peers', (m) => m.peers.xr === 1);
  assert.deepEqual(peers.peers, { tablet: 1, xr: 1 });
  await xr.close();
  await tablet.next('peers', (m) => m.peers.xr === 0);
  await tablet.close();
});

test('managerView는 부분 갱신되고 범위를 벗어난 값은 보정된다', async () => {
  const tablet = connect('tablet');
  const xr = connect('xr');
  await Promise.all([tablet.next('snapshot'), xr.next('snapshot')]);
  tablet.send({ type: 'patch', patch: { managerView: { yaw: 190, pitch: 120, aspect: 1.5 } } });
  const msg = await xr.next('patch', (m) => m.patch.managerView);
  assert.deepEqual(msg.patch.managerView, { yaw: -170, pitch: 90, aspect: 1.5 });
  assert.equal(server.getState().managerView.fov, 75); // 안 보낸 값은 유지
  await Promise.all([tablet.close(), xr.close()]);
});

test('파노라마 목록: assets/pano의 파일을 이름 규칙으로 찾는다', async () => {
  const panos = listPanos();
  assert.equal(panos.white_day?.['4k'], '/assets/pano/white_day_4K.png');
  const res = await fetch(`http://localhost:${server.port}/api/panos`);
  assert.deepEqual((await res.json()).panos, panos);
});
