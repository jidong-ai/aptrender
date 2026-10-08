import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, STEP, clearsStrokes, createFlow, jumpFlow, nextStep, rewardFor, tabletSceneFor, xrSceneFor } from '../src/shared/scenario.js';
import { estimate } from '../src/shared/catalog.js';
import { LAYERS, PANOS, layerIdFor } from '../src/shared/scene.js';

// 가이드 대상만 눌러 처음부터 끝까지 진행한다(collect 단계는 남은 값을 차례로)
function playThrough() {
  let flow = createFlow(0);
  const visited = [flow.step];
  for (let guard = 0; guard < 200; guard++) {
    const step = STEP[flow.step];
    const action = step.target ?? 'auto';
    const value = step.collect ? step.values.find((v) => !flow.picks.includes(v)) : step.values?.[0];
    const r = nextStep(flow, { from: flow.step, action, value }, guard + 1);
    assert.ok(!r.error, r.error);
    if (r.reset) return { flow, visited };
    if (r.flow.step !== flow.step) visited.push(r.flow.step);
    flow = r.flow;
  }
  throw new Error('끝나지 않음');
}

test('가이드 대상만 눌러 엔딩까지 가면 리셋으로 끝난다', () => {
  const { flow, visited } = playThrough();
  assert.equal(visited.length, STEPS.length);
  assert.equal(flow.step, 'S5-2');
  assert.deepEqual(flow.choices, { island: 'b', floor: 'portland' }); // 김민선이 XR에서 고른 값
  assert.deepEqual(flow.picks, ['a', 'b', 'c']);
});

test('아일랜드 3개를 모두 제안해야 넘어간다(누른 순서대로 쌓임)', () => {
  let flow = jumpFlow(createFlow(0), 'S3-1c', 0);
  assert.deepEqual(flow.picks, []);
  flow = nextStep(flow, { from: 'S3-1c', action: 'product', value: 'b' }).flow;
  flow = nextStep(flow, { from: 'S3-1c', action: 'product', value: 'b' }).flow; // 같은 제품 두 번은 한 번
  assert.equal(flow.step, 'S3-1c');
  assert.deepEqual(flow.picks, ['b']);
  flow = nextStep(flow, { from: 'S3-1c', action: 'product', value: 'a' }).flow;
  flow = nextStep(flow, { from: 'S3-1c', action: 'product', value: 'c' }).flow;
  assert.equal(flow.step, 'S3-2a');
  assert.deepEqual(flow.picks, ['b', 'a', 'c']);
});

test('김민선이 고르는 장면은 자동으로 넘어가며 선택이 정해진다', () => {
  const s = jumpFlow(createFlow(0), 'S3-2a', 0);
  assert.equal(s.choices.island, null);
  const r = nextStep(s, { from: 'S3-2a', action: 'auto' });
  assert.equal(r.flow.step, 'S3-2b');
  assert.equal(r.flow.choices.island, 'b');
  assert.match(nextStep(s, { from: 'S3-2a', action: 'caption-next' }).error, /받을 수 없는/);
});

test('프롤로그는 뒤로 갈 수 있고, 매장 이후는 뒤로 갈 수 없다', () => {
  const p2 = jumpFlow(createFlow(0), 'S0-2', 0);
  assert.equal(nextStep(p2, { from: 'S0-2', action: 'back' }).flow.step, 'S0-1');
  const store = jumpFlow(createFlow(0), 'S0-4', 0);
  assert.match(nextStep(store, { from: 'S0-4', action: 'back' }).error, /뒤로/);
});

test('잘못된 입력은 거부된다', () => {
  const flow = createFlow(0);
  assert.match(nextStep(flow, { from: 'S0-0', action: 'nav:ohouse' }).error, /받을 수 없는/);
  assert.match(nextStep(flow, { from: 'S2-1', action: 'start' }).error, /지난 단계/);
  assert.match(nextStep(flow, { from: 'S0-0', action: 'auto' }).error, /자동/);
  const product = jumpFlow(flow, 'S3-1c', 0);
  assert.match(nextStep(product, { from: 'S3-1c', action: 'product', value: 'z' }).error, /허용되지 않은/);
});

test('타이머는 주방에 들어갈 때 시작한다', () => {
  let flow = jumpFlow(createFlow(0), 'S1', 0);
  assert.equal(flow.timerAt, null);
  flow = nextStep(flow, { from: 'S1', action: 'auto' }, 500).flow;
  assert.equal(flow.step, 'S2-1');
  assert.equal(flow.timerAt, 500);
});

test('단계 이동은 건너뛴 선택을 기본값으로 채운다', () => {
  const flow = jumpFlow(createFlow(0), 'S4-3b', 0);
  assert.deepEqual(flow.choices, { island: 'b', floor: 'portland' });
  assert.deepEqual(jumpFlow(flow, 'S2-1', 0).choices, { island: null, floor: null });
  assert.equal(jumpFlow(flow, 'S9'), null);
});

test('S4(바닥재)는 태블릿·XR 모두 측면, S5는 다시 정면', () => {
  const base = createFlow(0);
  assert.equal(xrSceneFor(base).pano, null);
  for (const id of ['S4-1', 'S4-2c', 'S4-3b']) {
    const f = jumpFlow(base, id, 0);
    assert.equal(xrSceneFor(f).pano, 'kitchen_side', id);
    assert.equal(tabletSceneFor(f).pano, 'kitchen_side', id);
  }
  assert.deepEqual(xrSceneFor(jumpFlow(base, 'S5-1', 0)), { pano: 'kitchen_front', island: 'b', floor: 'portland' });
});

test('상담 중 안내는 가이드 UI, 매니저 말풍선은 매장 장면에서만', () => {
  for (const s of STEPS) {
    if (s.caption?.speaker === 'manager') assert.ok(['S0-4', 'S0-5a', 'S0-5b', 'S0-5c'].includes(s.id), s.id);
    assert.notEqual(s.caption?.speaker, 'guide', s.id);
  }
});

test('모든 단계의 장면·레이어가 정의돼 있다', () => {
  for (const s of STEPS) if (!['start', 'prologue'].includes(s.tablet.screen)) assert.ok(PANOS[s.tablet.pano], `${s.id} 태블릿 장면`);
  for (const pano of ['kitchen_front', 'kitchen_side']) {
    for (const opt of ['portland', 'flosso']) assert.ok(layerIdFor(pano, 'floor', opt), `${pano} 바닥재 ${opt}`);
    const id = layerIdFor(pano, 'island', 'b');
    assert.equal(LAYERS[id].pano, pano);
  }
});

test('예상 금액 = 항목 합계', () => {
  assert.equal(estimate({}).total, 0);
  const e = estimate({ island: 'b', floor: 'portland' });
  assert.equal(e.items.length, 4);
  assert.equal(e.total, e.items.reduce((s, i) => s + i.amount, 0));
  assert.ok(estimate({ island: 'a' }).total < estimate({ island: 'b' }).total);
});

test('엔딩 보상: 별 3개 조건과 칭호', () => {
  const full = rewardFor({ choices: { island: 'b', floor: 'portland' }, stats: { misses: 1 } });
  assert.equal(full.count, 3);
  assert.equal(full.title, '베테랑 위브 매니저');
  const one = rewardFor({ choices: { island: 'a', floor: 'flosso' }, stats: { misses: 5 } });
  assert.equal(one.count, 1);
});

test('주석은 체크 단계부터 아일랜드 배치 전까지만 남는다', () => {
  assert.equal(clearsStrokes('S2-2c'), true);
  assert.equal(clearsStrokes('S3-1c'), false);
  assert.equal(clearsStrokes('S3-2b'), true);
  assert.equal(STEP['S3-2a'].clearStrokes, true);
});
