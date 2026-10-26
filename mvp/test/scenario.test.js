import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, STEP, clearsStrokes, createFlow, jumpFlow, nextStep, tabletSceneFor, xrSceneFor } from '../src/shared/scenario.js';
import { estimate } from '../src/shared/catalog.js';
import { ANCHORS, LAYERS, PANOS, layerIdFor, parsePanoFile } from '../src/shared/scene.js';

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
  assert.equal(visited.length, STEPS.length); // 프롤로그 4장을 모두 거친다
  assert.equal(flow.step, 'S5-3');
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
  const store = jumpFlow(createFlow(0), 'S0-5', 0);
  assert.match(nextStep(store, { from: 'S0-5', action: 'back' }).error, /뒤로/);
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

test('S4(바닥재)부터 끝까지 태블릿·XR 모두 측면(아일랜드 누끼·바닥재가 함께 보이는 시점)', () => {
  const base = createFlow(0);
  assert.equal(xrSceneFor(base).pano, null);
  for (const id of ['S4-1', 'S4-2c', 'S4-3b']) {
    const f = jumpFlow(base, id, 0);
    assert.equal(xrSceneFor(f).pano, 'kitchen_side', id);
    assert.equal(tabletSceneFor(f).pano, 'kitchen_side', id);
  }
  assert.deepEqual(xrSceneFor(jumpFlow(base, 'S5-1', 0)), { pano: 'kitchen_side', island: 'b', floor: 'portland' });
});

test('상담 중 안내는 가이드 UI, 매니저 말풍선은 매장 장면에서만', () => {
  for (const s of STEPS) {
    if (s.caption?.speaker === 'manager') assert.ok(['S0-5', 'S0-6a', 'S0-6b', 'S0-6c', 'S0-6d', 'S0-6e'].includes(s.id), s.id);
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

test('시작화면: 버튼 하나로 프롤로그 4장을 거쳐 매장으로(장마다 러닝타임)', () => {
  let flow = createFlow(0);
  flow = nextStep(flow, { from: 'S0-0', action: 'start' }).flow;
  assert.equal(flow.step, 'S0-1');
  const seen = [];
  while (STEP[flow.step].chapter === 'prologue') {
    seen.push([flow.step, STEP[flow.step].auto]);
    flow = nextStep(flow, { from: flow.step, action: 'auto' }).flow;
  }
  assert.deepEqual(seen, [['S0-1', 3000], ['S0-2', 3000], ['S0-3', 5000], ['S0-4', 5000]]);
  assert.equal(flow.step, 'S0-5'); // 매장
  assert.ok(STEP['S0-4'].countdown);
  // 화면을 누르면 러닝타임 전에 바로 다음 장
  assert.equal(nextStep(jumpFlow(createFlow(0), 'S0-3', 0), { from: 'S0-3', action: 'prologue-next' }).flow.step, 'S0-4');
});

test('매장: 화살표를 누르는 장면은 그 화살표가 가리키는 공간으로 넘어간다', () => {
  for (const s of STEPS.filter((x) => x.target === 'hotspot')) {
    const spot = ANCHORS[s.tablet.pano]?.hotspot;
    assert.ok(spot, `${s.id}: ${s.tablet.pano}에 화살표가 없음`);
    assert.equal(STEPS[STEP[s.id].index + 1].tablet.pano, spot.to, s.id);
  }
  assert.equal(STEP['S0-6a'].tablet.character, 'front');
  assert.equal(STEP['S0-6b'].tablet.character, 'back');
  assert.deepEqual(STEP['S0-6d'].tablet.view, STEP['S0-6e'].tablet.view); // 같은 복도 시야에서 이어짐
});

test('바닥재 측면 렌더를 _left 이름으로 올려도 측면 레이어로 인식', () => {
  assert.deepEqual(parsePanoFile('floor_portland_left.png'), { id: 'floor_portland_side', size: '8k' });
  assert.deepEqual(parsePanoFile('floor_portland_front.png'), { id: 'floor_portland_front', size: '8k' });
});

test('아웃트로: 리포트 보내기 → 상담 리포트 → 마무리 → 처음으로', () => {
  let flow = jumpFlow(createFlow(0), 'S5-1', 0);
  flow = nextStep(flow, { from: 'S5-1', action: 'send-report' }).flow;
  assert.equal(flow.step, 'S5-2');
  assert.equal(STEP['S5-2'].tablet.screen, 'report');
  assert.ok(STEP['S5-2'].xr.report);
  flow = nextStep(flow, { from: 'S5-2', action: 'caption-next' }).flow;
  assert.equal(flow.step, 'S5-3');
  assert.equal(STEP['S5-3'].tablet.screen, 'outro');
  assert.deepEqual(nextStep(flow, { from: 'S5-3', action: 'restart' }), { reset: true });
  assert.deepEqual(nextStep(flow, { from: 'S5-3', action: 'auto' }), { reset: true });
});

test('주석은 체크 단계부터 아일랜드 배치 전까지만 남는다', () => {
  assert.equal(clearsStrokes('S2-2c'), true);
  assert.equal(clearsStrokes('S3-1c'), false);
  assert.equal(clearsStrokes('S3-2b'), true);
  assert.equal(STEP['S3-2a'].clearStrokes, true);
});
