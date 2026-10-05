import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { listLayers, listPanos, startServer } from '../server/app.js';

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
    next(type, pred = () => true, ms = 2000) {
      const match = (m) => m.type === type && pred(m);
      const i = queue.findIndex(match);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${role}: '${type}' 메시지를 받지 못함`)), ms);
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
  assert.equal(snap.state.flow.step, 'S0-0');
  assert.deepEqual(snap.state.flow.choices, { island: null, floor: null });
  assert.deepEqual(snap.state.strokes, []);
  await xr.close();
});

test('태블릿의 flow 입력이 검증된 뒤 XR에 다음 단계로 중계된다', async () => {
  const tablet = connect('tablet');
  const xr = connect('xr');
  await Promise.all([tablet.next('snapshot'), xr.next('snapshot')]);

  tablet.send({ type: 'flow', from: 'S0-0', action: 'start' });
  const msg = await xr.next('flow');
  assert.equal(msg.flow.step, 'S0-1');

  tablet.send({ type: 'flow', from: 'S0-1', action: 'hotspot' }); // 대상이 아님
  assert.match((await tablet.next('error')).message, /받을 수 없는/);
  tablet.send({ type: 'flow', from: 'S0-0', action: 'start' }); // 늦게 도착한 중복 탭
  assert.match((await tablet.next('error')).message, /지난 단계/);
  assert.equal(server.getState().flow.step, 'S0-1');

  tablet.send({ type: 'reset' });
  await xr.next('snapshot', (m) => m.reason === 'reset');
  await Promise.all([tablet.close(), xr.close()]);
});

test('patch는 managerView만 받는다', async () => {
  const tablet = connect('tablet');
  await tablet.next('snapshot');
  tablet.send({ type: 'patch', patch: { flow: {}, strokes: [] } });
  const err = await tablet.next('error');
  assert.match(err.message, /flow/);
  assert.match(err.message, /strokes/);
  await tablet.close();
});

test('직원용 jump: 선택을 채우고 모두에게 스냅샷, 끊긴 화면은 재접속 때 복구', async () => {
  const tablet = connect('tablet');
  let xr = connect('xr');
  await Promise.all([tablet.next('snapshot'), xr.next('snapshot')]);
  await xr.close();

  tablet.send({ type: 'jump', step: 'S4-1a' });
  const snap = await tablet.next('snapshot', (m) => m.reason === 'jump');
  assert.deepEqual(snap.state.flow.choices, { island: 'b', floor: null });

  xr = connect('xr');
  const again = await xr.next('snapshot');
  assert.equal(again.state.flow.step, 'S4-1a');

  tablet.send({ type: 'jump', step: 'nope' });
  assert.match((await tablet.next('error')).message, /알 수 없는 단계/);
  tablet.send({ type: 'reset' });
  await xr.next('snapshot', (m) => m.reason === 'reset');
  await Promise.all([tablet.close(), xr.close()]);
});

test('로딩 단계(S1)는 서버가 시간이 되면 자동으로 넘긴다', async () => {
  const tablet = connect('tablet');
  await tablet.next('snapshot');
  tablet.send({ type: 'jump', step: 'S1' });
  await tablet.next('snapshot', (m) => m.reason === 'jump');
  const msg = await tablet.next('flow', () => true, 5000);
  assert.equal(msg.flow.step, 'S2-1');
  assert.ok(msg.flow.timerAt);
  tablet.send({ type: 'reset' });
  await tablet.next('snapshot', (m) => m.reason === 'reset');
  await tablet.close();
});

test('주석 stroke 시작·추가·종료·삭제가 상태와 중계에 반영된다', async () => {
  const tablet = connect('tablet');
  const xr = connect('xr');
  await Promise.all([tablet.next('snapshot'), xr.next('snapshot')]);

  const stroke = { id: 't-1', tool: 'pen', width: 2, color: '#ff3b30', pts: [[10, 5]] };
  tablet.send({ type: 'stroke:start', stroke });
  assert.deepEqual((await xr.next('stroke:start')).stroke, { ...stroke, pano: 'kitchen_front' }); // pano 생략 시 주방 정면

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

test('아일랜드를 놓으면 체크 주석이 지워지고, stat은 flow.stats에 쌓인다', async () => {
  const tablet = connect('tablet');
  const xr = connect('xr');
  await Promise.all([tablet.next('snapshot'), xr.next('snapshot')]);
  tablet.send({ type: 'jump', step: 'S3-1c' });
  await xr.next('snapshot', (m) => m.reason === 'jump');
  tablet.send({ type: 'stroke:start', stroke: { id: 'chk', tool: 'pencil', width: 4, color: '#003270', pts: [[0, -20]] } });
  await xr.next('stroke:start');

  tablet.send({ type: 'stat', key: 'misses' });
  assert.equal((await xr.next('flow')).flow.stats.misses, 1);
  tablet.send({ type: 'stat', key: 'nope' });
  assert.match((await tablet.next('error')).message, /stat/);

  tablet.send({ type: 'flow', from: 'S3-1c', action: 'product', value: 'b' });
  await xr.next('flow', (m) => m.flow.step === 'S3-2');
  assert.equal((await xr.next('stroke:erase')).id, 'chk');
  assert.equal(server.getState().strokes.length, 0);
  assert.equal(server.getState().flow.stats.misses, 1); // 단계가 넘어가도 기록 유지

  tablet.send({ type: 'reset' });
  await xr.next('snapshot', (m) => m.reason === 'reset');
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

test('파노라마 목록: 원본·built 폴더를 이름 규칙·별칭으로 찾고, 누끼는 뺀다', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-'));
  fs.mkdirSync(path.join(dir, 'built'));
  for (const f of ['pano_front.png', 'pano_side.jpg', 'island_a.png', 'island_a_cut.png', 'store_1_8k.jpg', 'notes.txt']) fs.writeFileSync(path.join(dir, f), '');
  for (const f of ['pano_front_4k.jpg', 'pano_front_8k.jpg', 'pano_side_4k.jpg']) fs.writeFileSync(path.join(dir, 'built', f), '');
  assert.deepEqual(listPanos(dir), {
    kitchen_front: { '4k': '/assets/pano/built/pano_front_4k.jpg', '8k': '/assets/pano/built/pano_front_8k.jpg' }, // PNG보다 built JPG
    kitchen_side: { '4k': '/assets/pano/built/pano_side_4k.jpg', '8k': '/assets/pano/pano_side.jpg' },
    island_a_side: { '8k': '/assets/pano/island_a.png' },
    store_1: { '8k': '/assets/pano/store_1_8k.jpg' },
  });
  fs.rmSync(dir, { recursive: true });
  const res = await fetch(`http://localhost:${server.port}/api/panos`);
  assert.deepEqual((await res.json()).panos, listPanos());
});

test('레이어 목록: manifest에 있고 파일이 실제로 있는 것만', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-'));
  fs.mkdirSync(path.join(dir, 'built', 'layers'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'built', 'layers', 'island_b_side_4k.webp'), '');
  fs.writeFileSync(
    path.join(dir, 'built', 'layers', 'manifest.json'),
    JSON.stringify({ layers: { island_b_side: { kind: 'island', rect: [0.4, 0.5, 0.6, 0.8], files: { '4k': 'built/layers/island_b_side_4k.webp', '8k': 'built/layers/island_b_side_8k.webp' } } } }),
  );
  assert.deepEqual(listLayers(dir), {
    island_b_side: { kind: 'island', rect: [0.4, 0.5, 0.6, 0.8], files: { '4k': '/assets/pano/built/layers/island_b_side_4k.webp' } },
  });
  assert.deepEqual(listLayers(path.join(dir, 'nope')), {});
  fs.rmSync(dir, { recursive: true });
});
