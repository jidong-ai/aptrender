// 게임형 가이드 플로우: 체험 단계 정의와 진행 규칙(순수 함수). 서버·태블릿·XR이 함께 쓴다.
// 단계를 고치거나 문구를 바꿀 때는 이 파일만 고친다. 표로 보기: docs/SCENARIO.md
//
// 단계 필드
//  caption  { speaker, text }  speaker: 'guide'(안내, 태블릿에만) | 'manager'(매니저 대사) | 'customer'(고객, 김민선)
//  target   관람객이 눌러야 할 대상. 이것만 누를 수 있다(파노라마 둘러보기는 항상 가능)
//  hint     가이드 화살표 옆 지시문
//  values   target이 여러 값 중 하나를 고르는 경우(후보 선택)
//  set      다음 단계로 넘어갈 때 선택 상태에 더할 값
//  auto     이 시간(ms)이 지나면 서버가 자동으로 넘긴다
//  quiet    가이드 표시 없이 대상만 누를 수 있게(시작화면처럼 버튼이 이미 눈에 띌 때)
//  dim      대상 외 화면을 어둡게 할지. 생략하면 작은 메뉴 버튼(tool:·nav:·category:)만 어둡게 한다
//  clearStrokes  다음 단계로 넘어갈 때 주석을 지운다
//  tablet   태블릿 화면: screen('start'|'pano'|'ending'), pano, panel(가운데 카드), annotate, dims
//  xr       XR 화면: screen('standby'|'boot'|'home'|'ending'), side(고객만 측면으로, sideAfter ms 뒤), report

import { FLOOR_OPTIONS, ISLAND_OPTIONS } from './scene.js';

export const SPEAKERS = { guide: '안내', manager: '매니저', customer: '김민선 고객' };

export const STEPS = [
  // ---------- 0 오프닝 (매장) ----------
  {
    id: 'S0-0',
    chapter: 'opening',
    target: 'start',
    hint: '눌러서 체험 시작',
    quiet: true,
    tablet: { screen: 'start', pano: 'store_1' },
    xr: { screen: 'standby' },
  },
  {
    id: 'S0-1',
    chapter: 'opening',
    caption: { speaker: 'guide', text: "안녕하세요 저는 오늘의집 위브 매니저입니다. 오늘 저 대신 '주방 부분 리모델링'을 희망하는 고객의 인테리어 상담을 진행해주실거에요" },
    target: 'caption-next',
    hint: '다음',
    tablet: { pano: 'store_1' },
    xr: { screen: 'standby' },
  },
  {
    id: 'S0-2a',
    chapter: 'opening',
    caption: { speaker: 'guide', text: '아일랜드 설치를 희망하셔서, 김민선씨가 미리 업로드해주신 주방 3d스캔본 위에서 캡션 안내에 따라 공간을 제안해주세요' },
    target: 'hotspot',
    hint: '화살표를 눌러 안으로 이동',
    tablet: { pano: 'store_1' },
    xr: { screen: 'standby' },
  },
  {
    id: 'S0-2b',
    chapter: 'opening',
    caption: { speaker: 'guide', text: '상담실에서 김민선 씨가 기다리고 있어요' },
    target: 'hotspot',
    hint: '화살표를 눌러 상담실로 이동',
    tablet: { pano: 'store_2' },
    xr: { screen: 'standby' },
  },
  // ---------- 1 로딩 ----------
  {
    id: 'S1',
    chapter: 'loading',
    caption: { speaker: 'guide', text: '김민선 씨 XR 헤드셋을 착용중' },
    auto: 3500,
    tablet: { pano: 'counsel', panel: 'loading' },
    xr: { screen: 'boot' },
  },
  // ---------- 2 주방 ----------
  {
    id: 'S2-1',
    chapter: 'kitchen',
    caption: { speaker: 'manager', text: '일자형 부엌에 아일랜드를 추가하고싶으신거군요' },
    target: 'caption-next',
    hint: '화면을 끌어 주방을 둘러보세요',
    look: true, // 충분히 둘러본 뒤에 '다음'이 열린다
    startsTimer: true,
    tablet: { pano: 'kitchen_front' },
    xr: { screen: 'home' },
  },
  {
    id: 'S2-2a',
    chapter: 'kitchen',
    caption: { speaker: 'manager', text: '싱크대로부터 900mm 이동동선 확보하고 이 쪽에 한 번 배치해볼게요' },
    target: 'tool:measure',
    hint: '치수확인',
    tablet: { pano: 'kitchen_front' },
    xr: { screen: 'home' },
  },
  {
    id: 'S2-2b',
    chapter: 'kitchen',
    caption: { speaker: 'guide', text: '900mm 지점에 표시를 남겨 김민선 씨에게 보여주세요' },
    target: 'tool:annotate',
    hint: '주석추가',
    tablet: { pano: 'kitchen_front', dims: true },
    xr: { screen: 'home', dims: true },
  },
  {
    id: 'S2-2c',
    chapter: 'kitchen',
    caption: { speaker: 'guide', text: '점선을 따라 체크해 주세요' },
    target: 'trace',
    hint: '점선을 따라 그리기',
    tablet: { pano: 'kitchen_front', dims: true, annotate: true },
    xr: { screen: 'home', dims: true },
  },
  // ---------- 3 아일랜드 ----------
  {
    id: 'S3-1a',
    chapter: 'island',
    caption: { speaker: 'manager', text: '마호가니 컬러의 어두운 목재로 무게감을 주고싶으시다고 하셨으니 이 제품으로 선택해볼게요' },
    target: 'nav:ohouse',
    hint: '오늘의집',
    tablet: { pano: 'kitchen_front', dims: true },
    xr: { screen: 'home', dims: true },
  },
  {
    id: 'S3-1b',
    chapter: 'island',
    caption: { speaker: 'manager', text: '마호가니 컬러의 어두운 목재로 무게감을 주고싶으시다고 하셨으니 이 제품으로 선택해볼게요' },
    target: 'category:object',
    hint: '오브제',
    tablet: { pano: 'kitchen_front', panel: 'ohouse' },
    xr: { screen: 'home' },
  },
  {
    id: 'S3-1c',
    chapter: 'island',
    caption: { speaker: 'manager', text: '마호가니 컬러의 어두운 목재로 무게감을 주고싶으시다고 하셨으니 이 제품으로 선택해볼게요' },
    target: 'product',
    values: ['b'],
    hint: '아떼 원목 아일랜드 식탁',
    set: () => ({ island: 'b' }),
    clearStrokes: true, // 아일랜드를 놓으면 900mm 체크 표시는 역할을 다했으므로 지운다
    tablet: { pano: 'kitchen_front', panel: 'catalog' },
    xr: { screen: 'home' },
  },
  {
    id: 'S3-2',
    chapter: 'island',
    caption: { speaker: 'customer', text: '아일랜드 안쪽 모습도 더 자세히 보고싶어요' },
    target: 'caption-next',
    hint: '다음',
    tablet: { pano: 'kitchen_front' },
    xr: { screen: 'home' }, // 고객 대사만. 측면 전환은 '다음'을 누른 뒤(S3-3a부터)
  },
  {
    id: 'S3-3a',
    chapter: 'island',
    caption: { speaker: 'guide', text: '가장 잘어울리는 제품을 김민선 씨에게 제안해주세요' },
    target: 'nav:detail',
    hint: '상담상세',
    tablet: { pano: 'kitchen_front' },
    xr: { screen: 'home', side: true }, // 고객이 아일랜드 측면(안쪽)을 보는 동안 후보를 고른다
  },
  {
    id: 'S3-3b',
    chapter: 'island',
    caption: { speaker: 'guide', text: '가장 잘어울리는 제품을 김민선 씨에게 제안해주세요' },
    target: 'detail:island',
    hint: '아일랜드 적용제품',
    tablet: { pano: 'kitchen_front', panel: 'detail' },
    xr: { screen: 'home', side: true }, // 고객이 아일랜드 측면(안쪽)을 보는 동안 후보를 고른다
  },
  {
    id: 'S3-3c',
    chapter: 'island',
    caption: { speaker: 'guide', text: '가장 잘어울리는 제품을 김민선 씨에게 제안해주세요' },
    target: 'choice:island',
    values: ISLAND_OPTIONS,
    hint: '제품 하나를 골라 주세요',
    set: (value) => ({ island: value }),
    tablet: { pano: 'kitchen_front', panel: 'detail', expand: 'island' },
    xr: { screen: 'home', side: true }, // 고객이 아일랜드 측면(안쪽)을 보는 동안 후보를 고른다
  },
  // ---------- 4 바닥재 ----------
  {
    id: 'S4-1a',
    chapter: 'floor',
    caption: { speaker: 'manager', text: '기존 주방에서 중앙에 들어오는 아일랜드가 조금 튀어보이네요. 어두운 타일자재를 사용하면 톤을 맞추면서도 주방 청소가 용이해요' },
    target: 'tool:options',
    hint: '옵션수정',
    tablet: { pano: 'kitchen_front' },
    xr: { screen: 'home' },
  },
  {
    id: 'S4-1b',
    chapter: 'floor',
    caption: { speaker: 'manager', text: '기존 주방에서 중앙에 들어오는 아일랜드가 조금 튀어보이네요. 어두운 타일자재를 사용하면 톤을 맞추면서도 주방 청소가 용이해요' },
    target: 'chip',
    hint: '이 색상 선택',
    tablet: { pano: 'kitchen_front', panel: 'options' },
    xr: { screen: 'home' },
  },
  {
    id: 'S4-1c',
    chapter: 'floor',
    caption: { speaker: 'manager', text: '기존 주방에서 중앙에 들어오는 아일랜드가 조금 튀어보이네요. 어두운 타일자재를 사용하면 톤을 맞추면서도 주방 청소가 용이해요' },
    target: 'apply',
    hint: '적용하기',
    set: () => ({ floor: 'portland' }),
    tablet: { pano: 'kitchen_front', panel: 'options', chipPicked: true },
    xr: { screen: 'home' },
  },
  {
    id: 'S4-2a',
    chapter: 'floor',
    caption: { speaker: 'guide', text: '가장 잘어울리는 제품을 김민선 씨에게 제안해주세요' },
    target: 'nav:detail',
    hint: '상담상세',
    tablet: { pano: 'kitchen_front' },
    xr: { screen: 'home' },
  },
  {
    id: 'S4-2b',
    chapter: 'floor',
    caption: { speaker: 'guide', text: '가장 잘어울리는 제품을 김민선 씨에게 제안해주세요' },
    target: 'detail:floor',
    hint: '바닥 적용제품',
    tablet: { pano: 'kitchen_front', panel: 'detail' },
    xr: { screen: 'home' },
  },
  {
    id: 'S4-2c',
    chapter: 'floor',
    caption: { speaker: 'guide', text: '가장 잘어울리는 제품을 김민선 씨에게 제안해주세요' },
    target: 'choice:floor',
    values: FLOOR_OPTIONS,
    hint: '바닥재 하나를 골라 주세요',
    set: (value) => ({ floor: value }),
    tablet: { pano: 'kitchen_front', panel: 'detail', expand: 'floor' },
    xr: { screen: 'home' },
  },
  // ---------- 5 아웃트로 ----------
  {
    id: 'S5-1',
    chapter: 'outro',
    caption: { speaker: 'guide', text: '상담 내용을 정리해 김민선 씨에게 보내 주세요' },
    target: 'send-report',
    hint: '상담 리포트 보내기',
    tablet: { pano: 'kitchen_front', panel: 'summary' },
    xr: { screen: 'home' },
  },
  {
    id: 'S5-2',
    chapter: 'outro',
    caption: { speaker: 'customer', text: '이대로 진행하고 싶어요' },
    target: 'restart',
    hint: '다시 체험하기',
    quiet: true,
    auto: 25000,
    next: 'reset',
    tablet: { screen: 'ending', pano: 'kitchen_front' },
    xr: { screen: 'ending', report: true },
  },
];

export const STEP = Object.fromEntries(STEPS.map((s, i) => [s.id, { ...s, index: i }]));
export const FIRST_STEP = STEPS[0].id;

export const stepIndex = (id) => STEP[id]?.index ?? -1;

const emptyStats = () => ({ misses: 0, traceTries: 0 });

export function createFlow(now = Date.now()) {
  return { step: FIRST_STEP, enteredAt: now, timerAt: null, choices: { island: null, floor: null }, stats: emptyStats() };
}

/** 대상 외 화면을 어둡게 할지. 전체 공간·상담 내용을 봐야 하는 단계는 하이라이트만 */
export const coachDim = (step) => step.dim ?? /^(tool|nav|category):/.test(step.target ?? '');

export const STAT_KEYS = ['misses', 'traceTries'];

/**
 * 엔딩 보상: 별 3개와 칭호.
 *  ★1 상담 완주 · ★2 고객 취향 반영(마호가니 아떼 선택) · ★3 막힘 없이 진행(헛탭 2번 이하)
 */
export function rewardFor(flow) {
  const stars = [
    { key: 'done', label: '상담 완주', ok: true },
    { key: 'taste', label: '고객 취향 반영', ok: flow.choices.island === 'b' },
    { key: 'smooth', label: '막힘 없이 진행', ok: (flow.stats?.misses ?? 0) <= 2 },
  ];
  const count = stars.filter((s) => s.ok).length;
  const title = ['', '신입 위브 매니저', '센스 있는 위브 매니저', '베테랑 위브 매니저'][count];
  return { stars, count, title };
}

function enter(flow, id, choices, now) {
  const step = STEP[id];
  return {
    step: id,
    enteredAt: now,
    timerAt: step.startsTimer && !flow.timerAt ? now : flow.timerAt,
    choices,
    stats: { ...emptyStats(), ...flow.stats },
  };
}

/**
 * 관람객 행동 → 다음 단계.
 *  msg = { from, action, value }  from: 태블릿이 보고 있던 단계(늦게 도착한 탭 걸러내기)
 *  반환: { flow } | { reset: true } | { error }
 */
export function nextStep(flow, msg, now = Date.now()) {
  const step = STEP[flow.step];
  if (!step) return { error: `알 수 없는 단계: ${flow.step}` };
  if (msg.from !== flow.step) return { error: `이미 지난 단계의 입력(${msg.from} ≠ ${flow.step})` };
  if (msg.action === 'auto') {
    if (!step.auto) return { error: `${step.id}는 자동으로 넘어가지 않습니다` };
  } else {
    if (!step.target || msg.action !== step.target) return { error: `${step.id}에서 받을 수 없는 입력: ${msg.action}` };
    if (step.values && !step.values.includes(msg.value)) return { error: `${step.id}: 허용되지 않은 값 ${msg.value}` };
  }
  const choices = { ...flow.choices, ...(step.set?.(msg.value) ?? {}) };
  const nextId = step.next ?? STEPS[step.index + 1]?.id;
  if (!nextId || nextId === 'reset') return { reset: true };
  return { flow: enter(flow, nextId, choices, now) };
}

/** 직원용 단계 이동. 건너뛴 단계의 선택은 시나리오 기본값(아일랜드 b · 포틀랜드 모티프)으로 채운다 */
export function jumpFlow(flow, id, now = Date.now()) {
  if (!STEP[id]) return null;
  const i = stepIndex(id);
  const choices = { island: null, floor: null };
  if (i > stepIndex('S3-1c')) choices.island = flow.choices.island ?? 'b';
  if (i > stepIndex('S4-1c')) choices.floor = flow.choices.floor ?? 'portland';
  const timerAt = i >= stepIndex('S2-1') ? (flow.timerAt ?? now) : null;
  return { step: id, enteredAt: now, timerAt, choices, stats: i === 0 ? emptyStats() : { ...emptyStats(), ...flow.stats } };
}

/** 이 단계로 바로 이동할 때 주석을 지워야 하는가(체크 단계 이전, 또는 아일랜드를 놓은 뒤) */
export const clearsStrokes = (id) => stepIndex(id) <= stepIndex('S2-2c') || stepIndex(id) > stepIndex('S3-1c');

/** XR(고객) 화면에 띄울 장면 { pano, island, floor } — 대기·부팅 화면이면 pano = null. now = 서버 시각(sideAfter 판단) */
export function xrSceneFor(flow, now = Infinity) {
  const step = STEP[flow.step];
  if (step.xr.screen === 'standby' || step.xr.screen === 'boot') return { pano: null, island: null, floor: null };
  if (step.xr.side && (!step.xr.sideAfter || now - flow.enteredAt >= step.xr.sideAfter)) return { pano: 'kitchen_side', island: flow.choices.island, floor: null };
  return { pano: 'kitchen_front', island: flow.choices.island, floor: flow.choices.floor };
}

/** 태블릿(매니저) 화면에 띄울 장면 */
export function tabletSceneFor(flow) {
  const step = STEP[flow.step];
  const pano = step.tablet.pano;
  if (pano !== 'kitchen_front') return { pano, island: null, floor: null };
  return { pano, island: flow.choices.island, floor: flow.choices.floor };
}
