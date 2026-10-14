// 김민선 무드보드(S2-1): 오늘의집 집들이에서 저장한 사진 4장. 태블릿(Figma 1179:240)과 XR(Figma 1181:159)이 같은 카드를 쓴다.
// 사진은 Figma에서 잘라 둔 구도 그대로 assets/ui/moodboard/에 225×225(2배)로 저장

export const MOODBOARD_PHOTOS = [
  { img: '/assets/ui/moodboard/mb-1.jpg', by: 'ningni_home' },
  { img: '/assets/ui/moodboard/mb-2.jpg', by: '헤이담' },
  { img: '/assets/ui/moodboard/mb-3.jpg', by: 'onlhouse' },
  { img: '/assets/ui/moodboard/mb-4.jpg', by: '뚠이95' },
];

export const MOODBOARD_TAGS = ['#원목', '#대리석', '#다크톤'];

const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls ?? '', textContent: text ?? '' });

/** 무드보드 카드를 box 안에 그린다. shared = XR(고객) 쪽의 '매니저에게 공유됨' 표시 */
export function renderMoodboardCard(box, { title, tags, shared = false }) {
  box.textContent = '';
  box.classList.add('mb');
  const titles = el('div', 'mb-titles');
  titles.append(el('b', '', title), el('small', '', '오늘의집 집들이에서 저장한 사진 4장'));
  const head = el('div', 'mb-head');
  head.append(titles);
  if (shared) {
    const badge = el('span', 'mb-shared');
    badge.append(Object.assign(document.createElement('img'), { src: '/assets/ui/figma/check-shared.svg', alt: '' }), '매니저에게 공유됨');
    head.append(badge);
  }
  const grid = el('div', 'mb-grid');
  for (const p of MOODBOARD_PHOTOS) {
    const tile = el('span', 'mb-tile');
    tile.append(Object.assign(document.createElement('img'), { src: p.img, alt: '', decoding: 'async' }), el('span', 'mb-by', `${p.by} 님`));
    grid.append(tile);
  }
  const tagRow = el('div', 'mb-tags');
  for (const t of tags) tagRow.append(el('span', '', t));
  box.append(head, grid, tagRow);
}
