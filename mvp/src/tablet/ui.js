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
  { target: 'tool:light', icon: 'light', label: '조명변경' },
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

export function buildCardHead(el) {
  const time = h('span.card-time', {}, '00:00');
  el.append(
    h('div.avatar', {}, picture('avatar.png', '')),
    h('div', {}, h('div.card-title', {}, '김민선 고객님 상담중...'), time),
    h('button.card-close', { type: 'button', dataset: { target: 'card-close' } }, icon('close', { size: 42 })),
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

function estimateBox(choices, { note = true, bumpKey } = {}) {
  const { items, total } = estimate(choices);
  const totalEl = h('div.total', { dataset: { key: bumpKey ?? '' } }, won(total));
  return h(
    'div.estimate',
    {},
    h('small', {}, '예상 금액'),
    totalEl,
    h(
      'ul',
      {},
      items.length ? items.map((i) => h('li', {}, h('span', {}, i.label), h('span', {}, won(i.amount)))) : h('li', {}, h('span', {}, '선택한 제품이 없어요')),
    ),
    ...items.filter((i) => i.formula).map((i) => h('div.formula', {}, i.formula)),
    note && h('div.note', {}, '전시용 예시 금액입니다'),
  );
}

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
  catalog() {
    return [
      h('h3.panel-title', {}, '오브제 · 아일랜드 식탁'),
      h(
        'div.products',
        {},
        Object.entries(ISLANDS).map(([key, p]) =>
          h(
            'button.product',
            { type: 'button', dataset: { target: 'product', value: key } },
            picture(p.img, p.name),
            h('b', {}, p.name),
            h('small', {}, `${p.brand} · ${p.color}`),
            h('span.price', {}, won(p.price)),
          ),
        ),
      ),
    ];
  },
  detail({ flow, step }) {
    const { island, floor } = flow.choices;
    const expand = step.tablet.expand;
    const rows = [];
    const row = (key, ico, file, label, value, target) =>
      h(
        'button.row',
        { type: 'button', dataset: { target }, 'aria-expanded': String(expand === key) },
        h('span.row-ico', {}, icon(ico, { file })),
        h('span.row-text', {}, h('small', {}, label), h('b', {}, value)),
        icon('chevron', { size: 24 }),
      );
    rows.push(row('floor', 'floor', 'detail-floor.svg', '바닥', floor ? FLOORS[floor].name : '기존 바닥', 'detail:floor'));
    if (expand === 'floor') {
      rows.push(
        h(
          'div.choices',
          {},
          Object.entries(FLOORS).map(([key, f]) =>
            h(
              'button.choice',
              { type: 'button', dataset: { target: 'choice:floor', value: key }, 'aria-pressed': String(floor === key) },
              h('span.swatch', { style: { background: f.swatch } }),
              h('b', {}, f.name),
              h('small', {}, `${won(f.pricePerM2)}/㎡`),
            ),
          ),
        ),
      );
    }
    rows.push(row('island', 'island', 'detail-island.svg', '아일랜드', island ? ISLANDS[island].name : '선택 안 함', 'detail:island'));
    if (expand === 'island') {
      rows.push(
        h(
          'div.choices',
          {},
          Object.entries(ISLANDS).map(([key, p]) =>
            h(
              'button.choice',
              { type: 'button', dataset: { target: 'choice:island', value: key }, 'aria-pressed': String(island === key) },
              picture(p.img, p.name),
              h('b', {}, p.name),
              h('small', {}, won(p.price)),
            ),
          ),
        ),
      );
    }
    rows.push(row('light', 'light', 'detail-light.svg', '조명', '기존 조명', 'detail:light'));
    const box = estimateBox(flow.choices, { bumpKey: `${island}|${floor}` });
    box.append(h('button.reset-btn', { type: 'button', dataset: { target: 'detail:reset' } }, icon('refresh', { size: 20 }), '선택 초기화하기'));
    return [h('div.detail', {}, h('div.detail-rows', {}, rows), box)];
  },
  options({ step }) {
    const picked = Boolean(step.tablet.chipPicked);
    return [
      h(
        'div.options',
        {},
        h('div.options-head', {}, h('b', {}, '재질/색상'), h('span.dropdown', {}, '마루 · 진 그란데 스퀘어', icon('caret', { size: 20 }))),
        h(
          'div.chips',
          {},
          FLOOR_CHIPS.map((c, i) =>
            h('button.chip', {
              type: 'button',
              style: { background: c },
              dataset: { target: i === FLOOR_CHIP_SELECTED ? 'chip' : `chip:${i}` },
              'aria-pressed': String(picked && i === FLOOR_CHIP_SELECTED),
            }),
          ),
        ),
        h('div.options-area', {}, '적용 영역: 주방 바닥 전체 (9.5㎡)'),
        h('button.apply', { type: 'button', dataset: { target: 'apply' }, disabled: !picked }, '적용하기'),
      ),
    ];
  },
  summary({ flow }) {
    const { island, floor } = flow.choices;
    return [
      h('h3.panel-title', {}, '오늘 상담 요약'),
      h(
        'div.summary',
        {},
        h('div.row', {}, h('span.row-ico', {}, icon('island', { file: 'detail-island.svg' })), h('span.row-text', {}, h('small', {}, '아일랜드'), h('b', {}, island ? ISLANDS[island].name : '-'))),
        h('div.row', {}, h('span.row-ico', {}, icon('floor', { file: 'detail-floor.svg' })), h('span.row-text', {}, h('small', {}, '바닥재'), h('b', {}, floor ? FLOORS[floor].name : '-'))),
        estimateBox(flow.choices, { note: true }),
        h('button.send', { type: 'button', dataset: { target: 'send-report' } }, '상담 리포트 보내기'),
      ),
    ];
  },
};

export function renderPanel(body, name, ctx) {
  body.textContent = '';
  if (!PANELS[name]) return;
  body.append(...PANELS[name](ctx));
}

/**
 * 엔딩 보상 화면(게임 결과 화면처럼): 상담 완료 → 고객 반응 → 별 3개가 하나씩 → 기록 카운트업 → 칭호 획득 → 다시 하기
 * 레퍼런스: 학습 앱의 레슨 완료 화면(기록 카드 카운트업·색종이), 레이싱·요리 게임의 별점 결과, 업적 달성 배지
 */
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
