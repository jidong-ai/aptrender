// 상담 리포트 카드(S5-2): 선택한 제품과 최종 견적. 태블릿(매니저가 보낸 리포트)과 XR(김민선이 받은 리포트)이 같은 카드를 쓴다.
// 크기는 Figma 태블릿 프레임(2264×1292) 기준 px. XR은 .xr-report에서 0.836배로 줄인다
import { ESTIMATE, FLOORS, ISLANDS, estimate, won } from './catalog.js';
import { countUp } from './celebrate.js';

const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls ?? '', textContent: text ?? '' });
const img = (src) => Object.assign(document.createElement('img'), { src, alt: '' });

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** 선택한 제품 줄: 사진 + 분류·이름·설명 + 금액 */
function productRow({ photo, cat, name, sub, amount }) {
  const row = el('div', 'rp-item');
  const text = el('div', 'rp-item-text');
  text.append(el('small', '', cat), el('b', '', name), el('span', '', sub));
  row.append(el('span', 'rp-item-pic'), text, el('em', '', won(amount)));
  row.firstChild.append(img(photo));
  return row;
}

/**
 * box 안에 리포트 카드를 그린다.
 *  side = 'manager'(태블릿: 보낸 리포트) | 'customer'(XR: 받은 리포트)
 *  consultMs = 상담 시간(타이머 시작부터 리포트를 보낼 때까지)
 */
export function renderReportCard(box, { choices, consultMs = 0, side = 'manager' }) {
  box.textContent = '';
  box.classList.add('rp');
  const { island, floor } = choices;
  const { items, total } = estimate(choices);

  const head = el('div', 'rp-head');
  const titles = el('div', 'rp-titles');
  titles.append(el('small', '', '오늘의집 Weave 상담 리포트'), el('h2', '', '김민선 님 주방 상담 리포트'), el('span', 'rp-meta', `${today()} · 상담 시간 ${mmss(consultMs)} · 담당 위브 매니저`));
  const chip = el('span', 'rp-chip', side === 'manager' ? '김민선 님에게 보냈어요' : '매니저가 보낸 리포트');
  chip.prepend(img('/assets/ui/figma/check-shared.svg'));
  head.append(titles, chip);

  const picked = el('section', 'rp-col');
  picked.append(el('h3', '', '선택한 제품'));
  if (island) {
    const p = ISLANDS[island];
    picked.append(productRow({ photo: p.photo, cat: '아일랜드', name: p.name, sub: `${p.brand} · ${p.color}`, amount: p.price }));
  }
  if (floor) {
    const f = FLOORS[floor];
    picked.append(productRow({ photo: f.photo, cat: '바닥재', name: f.name, sub: `${f.brand} · 주방 ${ESTIMATE.areaM2}㎡`, amount: f.pricePerM2 * ESTIMATE.areaM2 }));
  }

  const bill = el('section', 'rp-col rp-bill');
  bill.append(el('h3', '', '견적 내역'));
  const lines = el('div', 'rp-lines');
  for (const it of items) {
    const line = el('div', 'rp-line');
    const label = el('span', '', it.label);
    if (it.formula) label.append(el('small', '', it.formula));
    line.append(label, el('b', '', won(it.amount)));
    lines.append(line);
  }
  const totalEl = el('strong', 'rp-total-num', won(total));
  const sum = el('div', 'rp-total');
  sum.append(el('span', '', '최종 견적'), totalEl);
  bill.append(lines, sum, el('p', 'rp-note', '전시용 예시 금액이에요. 실제 금액은 현장 실측 후 확정돼요.'));

  const body = el('div', 'rp-body');
  body.append(picked, bill);
  box.append(head, body);
  countUp(totalEl, total, { delay: 700, duration: 1100, format: won });
}
