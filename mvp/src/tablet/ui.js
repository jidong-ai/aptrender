// 태블릿 UI 조각: Figma 컴포넌트(상단 도구, 하단 메뉴, 타이머, 상담 카드 패널)와 와이어프레임 화면.
// 모든 버튼에는 data-target(가이드 대상 이름)을 단다. 누를 수 있는지는 coach.js가 정한다.
import { FLOORS, FLOOR_CHIPS, FLOOR_CHIP_SELECTED, ISLANDS, estimate, won } from '../shared/catalog.js';
import { icon, picture } from '../shared/ui-assets.js';
import { confetti, countUp } from '../shared/celebrate.js';
import { rewardFor } from '../shared/scenario.js';

/** 작은 DOM 도우미: h('button.pill', { dataset: {...} }, ...children) */
export function h(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export const TOOLS = [
  { target: 'tool:measure', icon: 'measure', label: '치수확인' },
  { target: 'tool:annotate', icon: 'annotate', label: '주석추가' },
  { target: 'tool:options', icon: 'options', label: '옵션수정' },
  { target: 'tool:light', icon: 'light', label: '조도조절' },
];

export const NAV = [
  { target: 'nav:client', icon: 'person', label: '고객정보' },
  { target: 'nav:detail', icon: 'agent', label: '상담상세' },
  { target: 'nav:products', icon: 'bag', label: '적용제품' },
  { target: 'nav:ohouse', icon: 'ohouse', label: '오늘의집' },
];

export const PEN_TOOLS = [
  { tool: 'pencil', icon: 'pencil', label: '연필', color: '#003270' },
  { tool: 'highlighter', icon: 'highlighter', label: '형광펜', color: '#1aa0ff' },
  { tool: 'pen', icon: 'pen', label: '펜', color: '#205ba5' },
];
export const PEN_WIDTHS = [0.5, 1, 2, 4, 8];

export const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function buildTools(el) {
  for (const t of TOOLS) el.append(h('button.pill', { type: 'button', dataset: { target: t.target } }, icon(t.icon), t.label));
}

export function buildNav(el) {
  for (const n of NAV) el.append(h('button', { type: 'button', dataset: { target: n.target } }, icon(n.icon, { size: 46 }), n.label));
}

export function buildTimer(el) {
  const time = h('span', {}, '00:00');
  el.append(icon('stop', { size: 40 }), time);
  return time;
}

// 카드 머리말(Figma 1438:3916 상단): 고객 사진 + 녹화 배지, "김민선 고객님 상담중...", 경과 시간, 닫기
export function buildCardHead(el) {
  const time = h('span.card-time', {}, '00:00');
  el.append(
    h('div.card-avatar', {}, h('span.ca-photo', {}, h('img', { src: '/assets/ui/figma/avatar.png', alt: '' })), h('img.ca-ring', { src: '/assets/ui/figma/detail-avatar-ring.svg', alt: '' }), h('img.ca-rec', { src: '/assets/ui/figma/detail-rec.svg', alt: '' })),
    h('div.card-titles', {}, h('div.card-title', {}, '김민선 고객님 상담중...'), time),
    h('button.card-close', { type: 'button', dataset: { target: 'card-close' } }, h('img', { src: '/assets/ui/figma/close.svg', alt: '닫기' })),
  );
  return time;
}

export function buildAnnotateBar(el, { onTool, onWidth, onErase }) {
  const tools = PEN_TOOLS.map((t) => h('button', { type: 'button', title: t.label, dataset: { pen: t.tool, free: '' }, onclick: () => onTool(t) }, icon(t.icon, { size: 36 })));
  const widths = PEN_WIDTHS.map((w) =>
    h('button', { type: 'button', title: `${w}`, dataset: { width: w, free: '' }, onclick: () => onWidth(w) }, h('span.width-dot', { style: { width: `${6 + w * 2.5}px`, height: `${6 + w * 2.5}px` } })),
  );
  const eraser = h('button', { type: 'button', title: '지우개', dataset: { free: '' }, onclick: onErase }, icon('eraser', { size: 36 }));
  el.append(...tools, eraser, h('hr'), ...widths);
  return {
    select(tool, width) {
      tools.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pen === tool)));
      widths.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.width) === width)));
    },
  };
}

// ---------- 카드 패널 ----------

const PANELS = {
  ohouse() {
    const cats = [
      ['cat-maru.png', '마루', 'category:floor'],
      ['cat-wallpaper.png', '벽지', 'category:wallpaper'],
      ['cat-tile.png', '타일', 'category:tile'],
      ['cat-object.png', '오브제', 'category:object'],
    ];
    return [
      h('h3.panel-title', {}, '오늘의집 카테고리'),
      h('div.cats', {}, cats.map(([img, label, target]) => h('button.cat', { type: 'button', dataset: { target } }, picture(img, label), label))),
      h('div.top10', {}, picture('top10.png', '오늘의집 인기 TOP10 (Figma 에셋 받기 전)')),
    ];
  },
  catalog({ flow }) {
    const picks = flow.picks ?? [];
    return [
      h('h3.panel-title', {}, `오브제 · 아일랜드 식탁 · 제안 ${picks.length}/3`),
      h(
        'div.products',
        {},
        Object.entries(ISLANDS).map(([key, p]) =>
          h(
            'button.product',
            { type: 'button', dataset: { target: 'product', value: key }, 'aria-pressed': String(picks.includes(key)) },
            h('span.pic', {}, h('img', { src: p.photo, alt: p.name })),
            h('b', {}, p.name),
            h('small', {}, `${p.brand} · ${p.color}`),
            h('span.price', {}, won(p.price)),
            picks.includes(key) && h('span.proposed', {}, '제안함'),
          ),
        ),
      ),
    ];
  },
  // 상담상세 = Figma 'XR/전문가상담/상담상세'(1438:3916) 본문. 텍스트·이미지만 체험 데이터로 바꾼다
  detail({ flow, step }) {
    return detailBody(flow, step.tablet.expand);
  },
  summary({ flow }) {
    return detailBody(flow, null);
  },
};

const FIG = '/assets/ui/figma';
export const FLOOR_PHOTO = { portland: '/assets/ui/figma/floor-portland.jpg', flosso: '/assets/ui/figma/floor-flosso.jpg' }; // guide/타일옵션 이미지에서 자른 견본
const ISLAND_PHOTO = Object.fromEntries(Object.entries(ISLANDS).map(([k, p]) => [k, p.photo]));

// 큰 카드(적용제품05~07): 사진 265×128 + 이름 + 설명 + 화살표
function bigCard({ title, sub, img, swatch, target, value, selected }) {
  const pic = swatch ? h('span.dc-img.is-swatch', { style: { background: swatch } }) : h('span.dc-img', {}, h('img', { src: img, alt: '' }));
  return h(
    'button.dc-big',
    { type: 'button', dataset: { target, value }, 'aria-pressed': selected === undefined ? undefined : String(selected) },
    pic,
    h('span.dc-row', {}, h('span.dc-text', {}, h('b', {}, title), h('small', {}, sub)), h('img.dc-arrow', { src: `${FIG}/detail-arrow.svg`, alt: '' })),
  );
}
// 작은 카드(적용제품09): Figma 그대로(흐리게, 이번 체험에서 다루지 않는 항목)
const SMALL = ['싱크대 상판', '주방 벽 타일', '가구', '벽지', '가구', '가구'];
const smallCard = (title) =>
  h(
    'div.dc-small',
    {},
    h('img.dc-ellipse', { src: `${FIG}/detail-floor.svg`, alt: '' }),
    h('span.dc-text', {}, h('b', {}, title), h('small', {}, '5㎡')),
    h('img.dc-arrow', { src: `${FIG}/detail-arrow.svg`, alt: '' }),
  );

function detailBody(flow, expand) {
  const { island, floor } = flow.choices;
  const { total } = estimate(flow.choices);
  let title = '적용 제품 한눈에 보기';
  let big;
  if (expand === 'island') {
    title = '아일랜드 제품 고르기';
    big = Object.entries(ISLANDS).map(([key, p]) =>
      bigCard({ title: p.name, sub: `${p.brand} · ${won(p.price)}`, img: ISLAND_PHOTO[key], target: 'choice:island', value: key, selected: island === key }),
    );
  } else if (expand === 'floor') {
    title = '바닥재 고르기';
    big = Object.entries(FLOORS).map(([key, f]) =>
      bigCard({ title: f.name.replace('진 그란데 스퀘어 ', ''), sub: `${f.brand} · ${won(f.pricePerM2)}/㎡`, img: FLOOR_PHOTO[key], target: 'choice:floor', value: key, selected: floor === key }),
    );
  } else {
    big = [
      bigCard({ title: '바닥재', sub: floor ? `9.5㎡, ${FLOORS[floor].name.replace('진 그란데 스퀘어 ', '')}` : '9.5㎡, 기존 바닥', ...(floor ? { img: FLOOR_PHOTO[floor] } : { swatch: '#d9d2c6' }), target: 'detail:floor' }),
      bigCard({ title: '아일랜드', sub: island ? ISLANDS[island].name : '선택 전', img: ISLAND_PHOTO[island ?? 'b'], target: 'detail:island' }),
      bigCard({ title: '가구 필름', sub: '00필름, H12345', img: ISLAND_PHOTO.b, target: 'detail:film' }),
    ];
  }
  return [
    h('div.dc-head', {}, h('b', {}, title), h('img.dc-help', { src: `${FIG}/detail-help.svg`, alt: '' }),
      h('button.dc-reset', { type: 'button', dataset: { target: 'detail:reset' } }, h('img', { src: `${FIG}/refresh.svg`, alt: '' }), '선택 초기화하기')),
    h('div.dc-grid', {}, h('div.dc-bigs', {}, big), h('div.dc-smalls', {}, SMALL.map(smallCard))),
    h('img.dc-divider', { src: `${FIG}/detail-divider.svg`, alt: '' }),
    h(
      'div.dc-foot',
      {},
      h('div', {}, h('b.dc-formula', {}, '(1)재료비 + (2)철거비 + (3)아일랜드 시공비'), h('p.dc-note', {}, '*실제 시공비는 본 계산과 상이할 수 있습니다. 예상금액은 참고용으로만\n확인해주시길 바랍니다.')),
      h('div.dc-price', {}, h('small', {}, '=예상금액'), h('b.total', { dataset: { key: `${island}|${floor}` } }, won(total))),
    ),
  ];
}

/**
 * 옵션수정 패널(Figma 'XR/툴바/옵션 수정' 1437:3759의 '옵션수정패널_재질색상').
 * 카드 없이 공간 위에 뜨고, 지시선이 바닥 적용 영역을 가리킨다
 */
export function renderOptionEditor(el, { picked }) {
  el.textContent = '';
  const chips = FLOOR_CHIPS.map((c, i) =>
    h('button.oe-chip', {
      type: 'button',
      style: { background: c },
      dataset: { target: i === FLOOR_CHIP_SELECTED ? 'chip' : `chip:${i}` },
      'aria-pressed': String(picked && i === FLOOR_CHIP_SELECTED),
    }),
  );
  const arrow = (side) => h(`span.oe-arrow.oe-arrow-${side}`, {}, h('img', { src: `${FIG}/chevron-right.svg`, alt: '' }));
  el.append(
    arrow('left'),
    h(
      'div.oe-wrap',
      {},
      h(
        'div.oe-panel',
        {},
        h('div.oe-head', {}, h('b', {}, '재질/색상'), h('span.oe-select', {}, '바닥재', h('img', { src: `${FIG}/option-caret.svg`, alt: '' }))),
        h('img.oe-line', { src: `${FIG}/option-line.svg`, alt: '' }),
        h('div.oe-sub', {}, h('span', {}, '색상'), h('span.oe-name', {}, picked ? FLOORS.portland.name.replace('진 그란데 스퀘어 ', '') : '')),
        h('div.oe-chips', {}, chips),
      ),
      h('button.oe-apply', { type: 'button', dataset: { target: 'apply' }, disabled: !picked }, '적용하기'),
    ),
    arrow('right'),
    h('img.oe-leader', { src: `${FIG}/option-leader.svg`, alt: '' }),
  );
}

export function renderPanel(body, name, ctx) {
  body.textContent = '';
  if (!PANELS[name]) return;
  body.append(...PANELS[name](ctx));
}

/**
 * 엔딩 보상 화면(게임 결과 화면처럼): 상담 완료 → 고객 반응 → 별 3개가 하나씩 → 기록 카운트업 → 칭호 획득 → 다시 하기
 * 레퍼런스: 학습 앱의 레슨 완료 화면(기록 카드 카운트업·색종이), 레이싱·요리 게임의 별점 결과, 업적 달성 배지
 */
// 무드보드(S2-1): 김민선이 오늘의집 집들이에서 저장한 사진. 사진이 오면 이미지로 바꾼다(지금은 와이어프레임)
export function renderMoodboard(el) {
  el.textContent = '';
  el.append(
    h('div.mb-head', {}, h('b', {}, '김민선 님의 무드보드'), h('small', {}, '오늘의집 집들이에서 저장한 사진 4')),
    h('div.mb-grid', {}, [1, 2, 3, 4].map((n) => h('span.mb-tile.is-wire', {}, `집들이 사진 ${n}`))),
  );
}

export function renderEnding(el, flow, { onShown = () => {} } = {}) {
  el.textContent = '';
  const reward = rewardFor(flow);
  const { total } = estimate(flow.choices);
  const consultMs = flow.timerAt ? Math.max(0, flow.enteredAt - flow.timerAt) : 0;
  const star = (s, i) =>
    h('div.r-star', { dataset: { ok: String(s.ok) }, style: { animationDelay: `${0.9 + i * 0.45}s` } }, h('span.r-star-ico', {}, '★'), h('small', {}, s.label));
  const stat = (label, valueEl, unit = '') => h('div.r-stat', {}, h('small', {}, label), h('b', {}, valueEl, unit && h('em', {}, unit)));
  const timeEl = h('span', {}, '00:00');
  const countEl = h('span', {}, '0');
  const totalEl = h('span', {}, '0원');
  el.append(
    h('div.r-burst'),
    h('div.r-head', {}, h('span.r-kicker', {}, 'CONSULTING COMPLETE'), h('h2', {}, '상담 완료!')),
    h('div.r-bubble', {}, h('span.r-avatar', {}, picture('avatar.png', '')), h('div', {}, h('small', {}, '김민선 고객'), h('q', {}, '이대로 진행하고 싶어요'))),
    h('div.r-stars', {}, reward.stars.map(star)),
    h('div.r-stats', {}, stat('상담 시간', timeEl), stat('제안한 제품', countEl, '개'), stat('예상 견적', totalEl)),
    h('div.r-badge', {}, h('span.r-badge-ico', {}, 'W'), h('div', {}, h('small', {}, '칭호 획득'), h('b', {}, reward.title))),
    h('div.r-cta', {}, h('button.r-again', { type: 'button', dataset: { target: 'restart' } }, '다시 체험하기'), h('span.r-auto', {}, '잠시 후 처음 화면으로 돌아갑니다')),
  );
  countUp(timeEl, consultMs / 1000, { delay: 2300, duration: 900, format: (n) => mmss(n * 1000) });
  countUp(countEl, [flow.choices.island, flow.choices.floor].filter(Boolean).length, { delay: 2300, duration: 700 });
  countUp(totalEl, total, { delay: 2300, duration: 1300, format: won });
  confetti(el, { origin: { x: 0.5, y: 0.25 } });
  setTimeout(() => confetti(el, { count: 90, origin: { x: 0.5, y: 0.62 } }), 3300); // 칭호 획득 때 한 번 더
  onShown(reward);
}
