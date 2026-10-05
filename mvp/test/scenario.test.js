import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, createFlow, jumpFlow, nextStep, tabletSceneFor, xrSceneFor } from '../src/shared/scenario.js';
import { estimate } from '../src/shared/catalog.js';
import { LAYERS, PANOS, layerIdFor } from '../src/shared/scene.js';

// 가이드 대상만 눌러 처음부터 끝까지 진행한다
function playThrough(picks = { island: 'b', floor: 'portland' }) {
  let flow = createFlow(0);
  const visited = [flow.step];
  for (let guard = 0; guard < 100; guard++) {
    const step = STEPS.find((s) => s.id === flow.step);
    const action = step.target ?? 'auto';
    const value = step.target === 'choice:island' ? picks.island : step.target === 'choice:floor' ? picks.floor : step.values?.[0];
    const r = nextStep(flow, { from: flow.step, action, value }, guard + 1);
    assert.ok(!r.error, r.error);
    if (r.reset) return { flow, visited };
    flow = r.flow;
    visited.push(flow.step);
  }
  throw new Error('끝나지 않음');
}

test('가이드 대상만 눌러 엔딩까지 가면 리셋으로 끝난다', () => {
  const { flow, visited } = playThrough();
  assert.equal(visited.length, STEPS.length);
  assert.equal(flow.step, 'S5-2');
  assert.deepEqual(flow.choices, { island: 'b', floor: 'portland' });
});

test('후보 선택이 최종 선택이 된다(아일랜드 c · 플로쏘)', () => {
  const { flow } = playThrough({ island: 'c', floor: 'flosso' });
  assert.deepEqual(flow.choices, { island: 'c', floor: 'flosso' });
});

test('잘못된 입력은 거부된다', () => {
  const flow = createFlow(0);
  assert.match(nextStep(flow, { from: 'S0-0', action: 'nav:ohouse' }).error, /받을 수 없는/);
  assert.match(nextStep(flow, { from: 'S2-1', action: 'start' }).error, /지난 단계/);
  assert.match(nextStep(flow, { from: 'S0-0', action: 'auto' }).error, /자동/);
  const choose = jumpFlow(flow, 'S3-3c', 0);
  assert.match(nextStep(choose, { from: 'S3-3c', action: 'choice:island', value: 'z' }).error, /허용되지 않은/);
  const product = jumpFlow(flow, 'S3-1c', 0);
  assert.ok(nextStep(product, { from: 'S3-1c', action: 'product', value: 'a' }).error); // 가운데 제품(b)만
});

test('타이머는 주방에 들어갈 때 시작한다', () => {
  let flow = jumpFlow(createFlow(0), 'S1', 0);
  assert.equal(flow.timerAt, null);
  flow = nextStep(flow, { from: 'S1', action: 'auto' }, 500).flow;
  assert.equal(flow.step, 'S2-1');
  assert.equal(flow.timerAt, 500);
});

test('단계 이동은 건너뛴 선택을 기본값으로 채운다', () => {
  const flow = jumpFlow(createFlow(0), 'S4-2a', 0);
  assert.deepEqual(flow.choices, { island: 'b', floor: 'portland' });
  assert.deepEqual(jumpFlow(flow, 'S2-1', 0).choices, { island: null, floor: null });
  assert.equal(jumpFlow(flow, 'S9'), null);
});

test('XR은 S3-2에서만 측면, 대기·부팅에는 장면 없음', () => {
  const base = createFlow(0);
  assert.equal(xrSceneFor(base).pano, null);
  assert.deepEqual(xrSceneFor(jumpFlow(base, 'S3-2', 0)), { pano: 'kitchen_side', island: 'b', floor: null });
  assert.equal(xrSceneFor(jumpFlow(base, 'S3-2', 0), 1000).pano, 'kitchen_front'); // 대사를 먼저 보고 2.5초 뒤 측면
  assert.equal(tabletSceneFor(jumpFlow(base, 'S3-2', 0)).pano, 'kitchen_front');
  assert.deepEqual(xrSceneFor(jumpFlow(base, 'S5-1', 0)), { pano: 'kitchen_front', island: 'b', floor: 'portland' });
});

test('모든 단계의 장면·레이어가 정의돼 있다', () => {
  for (const s of STEPS) assert.ok(PANOS[s.tablet.pano], `${s.id} 태블릿 장면`);
  for (const pano of ['kitchen_front', 'kitchen_side']) {
    for (const opt of ['a', 'b', 'c']) {
      const id = layerIdFor(pano, 'island', opt);
      if (id) assert.equal(LAYERS[id].pano, pano);
    }
  }
});

test('예상 금액 = 항목 합계', () => {
  assert.equal(estimate({}).total, 0);
  const e = estimate({ island: 'b', floor: 'portland' });
  assert.equal(e.items.length, 4);
  assert.equal(e.total, e.items.reduce((s, i) => s + i.amount, 0));
  assert.ok(estimate({ island: 'a' }).total < estimate({ island: 'b' }).total);
});

test('엔딩 보상: 별 3개 조건과 칭호', async () => {
  const { rewardFor } = await import('../src/shared/scenario.js');
  const full = rewardFor({ choices: { island: 'b', floor: 'portland' }, stats: { misses: 1 } });
  assert.equal(full.count, 3);
  assert.equal(full.title, '베테랑 위브 매니저');
  const one = rewardFor({ choices: { island: 'a', floor: 'flosso' }, stats: { misses: 5 } });
  assert.equal(one.count, 1);
  assert.deepEqual(one.stars.map((s) => s.ok), [true, false, false]);
});

test('주석은 체크 단계부터 아일랜드 배치 전까지만 남는다', async () => {
  const { clearsStrokes, STEP } = await import('../src/shared/scenario.js');
  assert.equal(clearsStrokes('S2-2c'), true);
  assert.equal(clearsStrokes('S3-1b'), false);
  assert.equal(clearsStrokes('S3-2'), true);
  assert.equal(STEP['S3-1c'].clearStrokes, true);
});
