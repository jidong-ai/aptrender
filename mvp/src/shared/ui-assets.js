// Figma에서 받은 아이콘·이미지(assets/ui/figma/)를 쓰고, 아직 없으면 와이어프레임으로 대신한다.
// 파일을 받는 방법: npm run ui:fetch (README 참고). 파일 이름은 scripts/fetch-figma-assets.mjs 목록과 같다.

let available = new Set();

/** 앱 시작 때 한 번. 있는 파일 목록을 받아 둔다(없는 파일을 요청해 404가 쌓이지 않게) */
export async function loadUiAssets() {
  try {
    const { files } = await (await fetch('/api/ui')).json();
    available = new Set(files);
  } catch {}
}

// 와이어프레임 아이콘(24×24, 선). Figma 아이콘(Material Symbols 계열)과 같은 뜻만 맞춘다
const PATHS = {
  measure: 'M3 8h18v8H3zM7 8v3M11 8v4M15 8v3M19 8v4',
  annotate: 'M4 20h16M6 16l9.5-9.5 2.5 2.5L8.5 18.5H6z',
  options: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4-4-7.5-9-7.5zM7.5 12.5h0M9.5 8h0M14.5 8h0',
  light: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.3 3.6-5.5 8-5.5s8 2.2 8 5.5',
  agent: 'M5 13v-1a7 7 0 0 1 14 0v1M5 13h2.5v5H5zM16.5 13H19v5h-2.5zM19 18c0 1.7-2 3-5 3',
  bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2',
  ohouse: 'M4 11l8-7 8 7v9H4zM10 20v-5h4v5',
  stop: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9h6v6H9z',
  pencil: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3',
  highlighter: 'M6 14l8-8 4 4-8 8H6zM4 20h8',
  pen: 'M12 3l4 6-4 12-4-12zM12 9v4',
  eraser: 'M8 20h12M5 15l8-8 5 5-6 6H8z',
  close: 'M6 6l12 12M18 6L6 18',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 17h0',
  arrow: 'M4 12h15M13 6l6 6-6 6',
  chevron: 'M9 5l7 7-7 7',
  caret: 'M7 10l5 5 5-5',
  refresh: 'M19 12a7 7 0 1 1-2.1-5M19 4v4h-4',
  floor: 'M3 15l9-5 9 5-9 5zM3 15v2l9 5 9-5v-2',
  island: 'M3 9h18v3H3zM5 12v8M19 12v8M5 16h14',
};

/** 아이콘 요소. name.svg 파일이 있으면 그 파일, 없으면 와이어프레임 선 아이콘 */
export function icon(name, { file = `${name}.svg`, size } = {}) {
  const el = document.createElement('span');
  el.className = 'ico';
  if (size) el.style.setProperty('--ico', `${size}px`);
  if (available.has(file)) {
    const img = new Image();
    img.src = `/assets/ui/figma/${file}`;
    img.alt = '';
    el.append(img);
  } else {
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${PATHS[name] ?? PATHS.help}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  return el;
}

/** 이미지 요소. 파일이 없으면 이름표를 단 회색 상자(와이어프레임) */
export function picture(file, label = '') {
  const el = document.createElement('span');
  el.className = 'pic';
  if (available.has(file)) {
    const img = new Image();
    img.src = `/assets/ui/figma/${file}`;
    img.alt = label;
    img.decoding = 'async';
    el.append(img);
  } else {
    el.classList.add('is-wire');
    el.textContent = label;
  }
  return el;
}

export const hasAsset = (file) => available.has(file);
