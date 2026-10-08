// 게임형 가이드 플로우: 체험 단계 정의와 진행 규칙(순수 함수). 서버·태블릿·XR이 함께 쓴다.
// 단계를 고치거나 문구를 바꿀 때는 이 파일만 고친다. 표로 보기: docs/SCENARIO.md
//
// 단계 필드
//  caption  말풍선 { speaker, text }  speaker: 'manager'(선배 매니저, 매장 장면에서만) | 'customer'(김민선, XR 자막에도)
//  guide    가이드 UI(Figma 1438:4043): 상담 중 관람객(=매니저)이 할 일을 알려 주는 한 줄. 태블릿에만
//  say      관람객이 맡은 매니저의 대사. XR 자막으로만 나온다(고객이 듣는 말)
//  collect  values를 모두 눌러야 넘어간다(누른 값은 flow.picks에 쌓임)
//  target   관람객이 눌러야 할 대상. 이것만 누를 수 있다(파노라마 둘러보기는 항상 가능)
//  hint     가이드 화살표 옆 지시문
//  values   target이 여러 값 중 하나를 고르는 경우(후보 선택)
//  set      다음 단계로 넘어갈 때 선택 상태에 더할 값
//  auto     이 시간(ms)이 지나면 서버가 자동으로 넘긴다
//  quiet    가이드 표시 없이 대상만 누를 수 있게(시작화면처럼 버튼이 이미 눈에 띌 때)
//  cta      대상이 'CTA button' 컴포넌트(이미 색으로 강조됨) → 하이라이트하지 않는다
//  back     프롤로그 '<' 버튼으로 돌아갈 단계
//  copy     프롤로그 본문(캡션 말풍선 없이 화면 가운데 큰 글씨)
//  dim      대상 외 화면을 어둡게 할지. 생략하면 작은 메뉴 버튼(tool:·nav:·category:)만 어둡게 한다
//  clearStrokes  다음 단계로 넘어갈 때 주석을 지운다
//  tablet   태블릿 화면: screen('start'|'pano'|'ending'), pano, panel(가운데 카드), annotate, dims
//  xr       XR 화면: screen('standby'|'boot'|'home'|'ending'), pano(기본 kitchen_front), moodboard, offer('island'|'floor' 제품 카드),
//           choose(카드 중 김민선이 고르는 값, 고르는 장면 재생), report

import { FLOOR_OPTIONS, ISLAND_OPTIONS } from './scene.js';

// 말풍선(Figma 1433:3440 · 1434:3719): manager = 매장에서 관람객을 맞는 선배 매니저, customer = 고객 김민선
export const SPEAKERS = { guide: '매니저', manager: '매니저', customer: '김민선' };

export const STEPS = [
  // ---------- 0 시작화면 · 프롤로그 (Figma 1434:3696) ----------
  {
    id: 'S0-0',
    chapter: 'opening',
    target: 'start',
    hint: '시작하기',
    cta: true,
    tablet: { screen: 'start' },
    xr: { screen: 'standby' },
  },
  {
    id: 'S0-1',
    chapter: 'prologue',
    target: 'prologue-next',
    back: 'S0-0',
    hint: '화면을 눌러 계속',
    auto: 2000, // 누르지 않아도 2초 뒤 다음 장
    quiet: true,
    copy: '오늘의집 Weave는 소비자의 인테리어 결정을 도와주는 XR서비스에요',
    tablet: { screen: 'prologue', page: 1 },
    xr: { screen: 'standby' },
  },
  {
    id: 'S0-2',
    chapter: 'prologue',
    target: 'prologue-next',
    back: 'S0-1',
    hint: '화면을 눌러 계속',
    auto: 2000, // 누르지 않아도 2초 뒤 다음 장
    quiet: true,
    copy: '소비자가 매장상담을 예약한 후, 꾸미고 싶은 공간을 3d 스캔해오면\n매장에서 오늘의집 매니저와 함께 공간을 완성해나가요',
    tablet: { screen: 'prologue', page: 2 },
    xr: { screen: 'standby' },
  },
  {
    id: 'S0-3',
    chapter: 'prologue',
    target: 'prologue-start',
    back: 'S0-2',
    hint: '상담 플로우 시작하기',
    cta: true,
    copy: '오늘 당신은 오늘의집 위브 매니저입니다.\n고객의 XR 화면을 보며 상담을 진행해주세요!',
    tablet: { screen: 'prologue', page: 3 },
    xr: { screen: 'standby' },
  },
  // ---------- 0 오프닝 (매장) ----------
  {
    id: 'S0-4',
    chapter: 'opening',
    caption: { speaker: 'manager', text: '반갑습니다! Weave 매장 첫 출근을 축하드려요.\n오늘 주방 인테리어 상담을 맡으셨다구요?' },
    target: 'caption-next',
    hint: '다음',
    tablet: { pano: 'store_1' },
    xr: { screen: 'standby' },
  },
  {
    id: 'S0-5a',
    chapter: 'opening',
    caption: { speaker: 'manager', text: '아일랜드 설치를 희망하셔서, 김민선씨가 미리 업로드해주신 주방 3d스캔본 위에서 캡션 안내에 따라 공간을 제안해주세요' },
    target: 'hotspot',
    hint: '화살표를 눌러 안으로 이동',
    tablet: { pano: 'store_1' },
    xr: { screen: 'standby' },
  },
  {
    id: 'S0-5b',
    chapter: 'opening',
    caption: { speaker: 'manager', text: '매장에서는 고객이 바닥재·타일 같은 자재 샘플을 직접 보고 만져볼 수 있어요' },
    target: 'hotspot',
    hint: '화살표를 눌러 안으로 이동',
    tablet: { pano: 'store_2' },
    xr: { screen: 'standby' },
  },
  {
    id: 'S0-5c',
    chapter: 'opening',
    caption: { speaker: 'manager', text: '상담실에서 김민선 씨가 기다리고 있어요' },
    target: 'hotspot',
    hint: '화살표를 눌러 상담실로 이동',
    tablet: { pano: 'store_3' },
    xr: { screen: 'standby' },
  },
  // ---------- 1 로딩 ----------
  {
    id: 'S1',
    chapter: 'loading',
    guide: '김민선 씨 XR 헤드셋을 착용중',
    auto: 3500,
    tablet: { pano: 'counsel', panel: 'loading' },
    xr: { screen: 'boot' },
  },
  // ---------- 2 주방: 고객 취향 공유(무드보드) → 900mm 동선 ----------
  {
    id: 'S2-1',
    chapter: 'kitchen',
    guide: '김민선 씨가 무드보드를 공유했어요',
    caption: { speaker: 'customer', text: '평소에 요리하는 걸 좋아해서, 이 사진들처럼 주방에 아일랜드를 추가하고 싶어요.' },
    target: 'caption-next',
    hint: '다음',
    look: true, // 충분히 둘러본 뒤에 '다음'이 열린다
    startsTimer: true,
    tablet: { pano: 'kitchen_front', moodboard: true },
    xr: { screen: 'home', moodboard: true },
  },
  {
    id: 'S2-2a',
    chapter: 'kitchen',
    guide: '치수확인을 눌러 싱크대로부터 900mm 이동동선을 확인해주세요',
    say: '싱크대로부터 900mm 이동동선 확보하고 이 쪽에 한 번 배치해볼게요',
    target: 'tool:measure',
    hint: '치수확인',
    tablet: { pano: 'kitchen_front' },
    xr: { screen: 'home' },
  },
  {
    id: 'S2-2b',
    chapter: 'kitchen',
    guide: '900mm 지점에 표시를 남겨 김민선 씨에게 보여주세요',
    target: 'tool:annotate',
    hint: '주석추가',
    tablet: { pano: 'kitchen_front', dims: true },
    xr: { screen: 'home', dims: true },
  },
  {
    id: 'S2-2c',
    chapter: 'kitchen',
    guide: '점선을 따라 체크해 주세요',
    target: 'trace',
    hint: '점선을 따라 그리기',
    tablet: { pano: 'kitchen_front', dims: true, annotate: true },
    xr: { screen: 'home', dims: true },
  },
  // ---------- 3 아일랜드: 매니저가 3개 제안 → 김민선이 XR에서 고름 ----------
  {
    id: 'S3-1a',
    chapter: 'island',
    guide: '무드보드 속 제품과 비슷한 소재의 아일랜드 3개를 제안해주세요.',
    target: 'nav:ohouse',
    hint: '오늘의집',
    tablet: { pano: 'kitchen_front', dims: true },
    xr: { screen: 'home', dims: true },
  },
  {
    id: 'S3-1b',
    chapter: 'island',
    guide: '무드보드 속 제품과 비슷한 소재의 아일랜드 3개를 제안해주세요.',
    target: 'category:object',
    hint: '오브제',
    tablet: { pano: 'kitchen_front', panel: 'ohouse' },
    xr: { screen: 'home' },
  },
  {
    id: 'S3-1c',
    chapter: 'island',
    guide: '무드보드 속 제품과 비슷한 소재의 아일랜드 3개를 제안해주세요.',
    target: 'product',
    values: ISLAND_OPTIONS,
    collect: true, // a·b·c를 모두 눌러야 넘어간다. 누른 순서대로 XR에 제품 카드가 뜬다
    hint: '제품을 눌러 제안하기',
    say: '무드보드와 비슷한 제품을 추천드릴게요',
    tablet: { pano: 'kitchen_front', panel: 'catalog' },
    xr: { screen: 'home', offer: 'island' },
  },
  {
    id: 'S3-2a',
    chapter: 'island',
    guide: '김민선 씨가 고르는 중', // 뒤에 점(…)이 흐른다
    auto: 6500, // XR에서 김민선이 카드 중 b를 고르는 장면이 재생된다
    set: () => ({ island: 'b' }),
    clearStrokes: true, // 아일랜드를 놓으면 900mm 체크 표시는 역할을 다했으므로 지운다
    tablet: { pano: 'kitchen_front', waiting: true },
    xr: { screen: 'home', offer: 'island', choose: 'b' },
  },
  {
    id: 'S3-2b',
    chapter: 'island',
    caption: { speaker: 'customer', text: '이 제품이 가격, 디자인 모두 제일 마음에 들어요.' },
    target: 'caption-next',
    hint: '다음',
    tablet: { pano: 'kitchen_front' },
    xr: { screen: 'home' },
  },
  // ---------- 4 바닥재: 고객 질문 → 매니저가 2개 제안 → 김민선이 XR에서 고름 (측면 시점) ----------
  {
    id: 'S4-1',
    chapter: 'floor',
    caption: { speaker: 'customer', text: '제품은 마음에 드는데, 우리 집에는 안어울려보이네요. 어떡하죠?' },
    target: 'caption-next',
    hint: '다음',
    tablet: { pano: 'kitchen_side' },
    xr: { screen: 'home', pano: 'kitchen_side' },
  },
  {
    id: 'S4-2a',
    chapter: 'floor',
    guide: '어두운 색상의 아일랜드에 어울리는 바닥재 2개를 제안해주세요.',
    say: '기존 주방에서 중앙에 들어오는 아일랜드가 조금 튀어보이네요. 어두운 타일자재를 사용하면 톤을 맞추면서도 주방 청소가 용이해요',
    target: 'tool:options',
    hint: '옵션수정',
    tablet: { pano: 'kitchen_side' },
    xr: { screen: 'home', pano: 'kitchen_side' },
  },
  {
    id: 'S4-2b',
    chapter: 'floor',
    guide: '어두운 색상의 아일랜드에 어울리는 바닥재 2개를 제안해주세요.',
    target: 'floor-surface',
    hint: '바닥면을 눌러 선택',
    tablet: { pano: 'kitchen_side', area: 'blink', optionsOn: true },
    xr: { screen: 'home', pano: 'kitchen_side' },
  },
  {
    id: 'S4-2c',
    chapter: 'floor',
    guide: '어두운 색상의 아일랜드에 어울리는 바닥재 2개를 제안해주세요.',
    target: 'chip',
    hint: '이 색상 선택',
    tablet: { pano: 'kitchen_side', panel: 'options', area: 'on' },
    xr: { screen: 'home', pano: 'kitchen_side' },
  },
  {
    id: 'S4-2d',
    chapter: 'floor',
    guide: '어두운 색상의 아일랜드에 어울리는 바닥재 2개를 제안해주세요.',
    target: 'apply',
    cta: true,
    hint: '적용하기',
    set: () => ({ floor: 'portland' }), // 제안한 바닥재를 먼저 깔아 보여 준다
    tablet: { pano: 'kitchen_side', panel: 'options', chipPicked: true, area: 'on' },
    xr: { screen: 'home', pano: 'kitchen_side' },
  },
  {
    id: 'S4-3a',
    chapter: 'floor',
    guide: '김민선 씨가 고르는 중', // 뒤에 점(…)이 흐른다
    auto: 6000, // XR에서 김민선이 바닥재 카드 2개 중 a(포틀랜드 모티프)를 고르는 장면
    set: () => ({ floor: 'portland' }),
    tablet: { pano: 'kitchen_side', waiting: true },
    xr: { screen: 'home', pano: 'kitchen_side', offer: 'floor', choose: 'portland' },
  },
  {
    id: 'S4-3b',
    chapter: 'floor',
    caption: { speaker: 'customer', text: '이 제품이 잘 어울리는 것 같아요.' },
    target: 'caption-next',
    hint: '다음',
    tablet: { pano: 'kitchen_side' },
    xr: { screen: 'home', pano: 'kitchen_side' },
  },
  // ---------- 5 아웃트로 ----------
  {
    id: 'S5-1',
    chapter: 'outro',
    guide: '상담 내용을 정리해 김민선 씨에게 보내 주세요',
    target: 'send-report',
    cta: true,
    hint: '상담 리포트 보내기',
    tablet: { pano: 'kitchen_front', panel: 'summary' },
    xr: { screen: 'home' },
  },
  {
    id: 'S5-2',
    chapter: 'outro',
    caption: { speaker: 'customer', text: '이대로 진행하고 싶어요' },
    target: 'restart',
    cta: true,
    hint: '다시 체험하기',
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
  return { step: FIRST_STEP, enteredAt: now, timerAt: null, choices: { island: null, floor: null }, picks: [], stats: emptyStats() };
}

/** 가이드 링을 띄우지 않는 단계: quiet, CTA 버튼(이미 색으로 강조), 캡션 화살표(화살표가 움직여 알려 줌) */
export const coachQuiet = (step) => Boolean(step.quiet || step.cta || step.target === 'caption-next');

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
    picks: flow.picks ?? [],
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
  if (msg.action === 'back') {
    if (!step.back) return { error: `${step.id}에서는 뒤로 갈 수 없습니다` };
    return { flow: enter(flow, step.back, flow.choices, now) };
  }
  if (msg.action === 'auto') {
    if (!step.auto) return { error: `${step.id}는 자동으로 넘어가지 않습니다` };
  } else {
    if (!step.target || msg.action !== step.target) return { error: `${step.id}에서 받을 수 없는 입력: ${msg.action}` };
    if (step.values && !step.values.includes(msg.value)) return { error: `${step.id}: 허용되지 않은 값 ${msg.value}` };
    if (step.collect) {
      // 모두 누를 때까지 같은 단계에 머문다
      const picks = (flow.picks ?? []).includes(msg.value) ? flow.picks : [...(flow.picks ?? []), msg.value];
      if (picks.length < step.values.length) return { flow: { ...flow, picks } };
      flow = { ...flow, picks };
    }
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
  if (i > stepIndex('S3-2a')) choices.island = flow.choices.island ?? 'b';
  if (i > stepIndex('S4-2d')) choices.floor = flow.choices.floor ?? 'portland';
  const picks = i > stepIndex('S3-1c') ? [...ISLAND_OPTIONS] : [];
  const timerAt = i >= stepIndex('S2-1') ? (flow.timerAt ?? now) : null;
  return { step: id, enteredAt: now, timerAt, choices, picks, stats: i === 0 ? emptyStats() : { ...emptyStats(), ...flow.stats } };
}

/** 이 단계로 바로 이동할 때 주석을 지워야 하는가(체크 단계 이전, 또는 아일랜드를 놓은 뒤) */
export const clearsStrokes = (id) => stepIndex(id) <= stepIndex('S2-2c') || stepIndex(id) > stepIndex('S3-2a');

/** XR(고객) 화면에 띄울 장면 { pano, island, floor } — 대기·부팅 화면이면 pano = null */
export function xrSceneFor(flow) {
  const step = STEP[flow.step];
  if (step.xr.screen === 'standby' || step.xr.screen === 'boot') return { pano: null, island: null, floor: null };
  return { pano: step.xr.pano ?? 'kitchen_front', island: flow.choices.island, floor: flow.choices.floor };
}

/** 태블릿(매니저) 화면에 띄울 장면 */
export function tabletSceneFor(flow) {
  const step = STEP[flow.step];
  const pano = step.tablet.pano;
  if (!pano?.startsWith('kitchen')) return { pano, island: null, floor: null };
  return { pano, island: flow.choices.island, floor: flow.choices.floor };
}
