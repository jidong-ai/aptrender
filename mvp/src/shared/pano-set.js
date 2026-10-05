import { makePlaceholderLayer, makeTestPano } from './test-pano.js';
import { LAYERS, PANOS, PLACEHOLDER_RECT, layerIdFor } from './scene.js';
import { FLOORS, ISLANDS } from './catalog.js';

// 렌더가 없는 장면의 테스트 격자 색
const TINTS = { store_1: '#e3ddd3', store_2: '#ddd6ca', counsel: '#d6dbe0', kitchen_front: '#e4e4e4', kitchen_side: '#dcdcdc' };
const ISLAND_TINT = { a: '#e8e4dc', b: '#5a2f22', c: '#b08a5e' };

// 화면에 동시에 올려 두는 묶음(장). 장이 바뀌면 다른 장의 텍스처를 내린다(아이패드·아이맥 메모리 보호)
const CHAPTERS = {
  opening: ['store_1', 'store_2', 'counsel'],
  main: ['kitchen_front', 'kitchen_side', ...Object.keys(LAYERS).map((id) => `layer:${id}`)],
};
const chapterOf = (pano) => (CHAPTERS.opening.includes(pano) ? 'opening' : 'main');

export const PART_TEXT = { render: '렌더', cut: '누끼', full: '통째 렌더', wire: '와이어프레임', test: '테스트 격자' };

/**
 * /api/panos 목록을 받아, 지금 장(chapter)에 필요한 파노라마·레이어를 한 장씩 불러온다.
 *  - size: '4k'(태블릿) | '8k'(XR). 원하는 크기가 없으면 다른 크기로 대체
 *  - maxWidth: 텍스처 최대 가로 픽셀. 넘으면 줄여서 올린다
 * 렌더가 없으면 테스트 격자, 누끼가 없으면 와이어프레임 레이어로 대신해서 모든 단계가 끊기지 않는다.
 */
export async function createPanoSet(viewer, { size, maxWidth, log = () => {} }) {
  let catalog = {};
  let layers = {};
  try {
    ({ panos: catalog = {}, layers = {} } = await (await fetch('/api/panos')).json());
  } catch {
    log('파노라마 목록을 받지 못함 → 테스트 격자로 표시');
  }

  const other = size === '4k' ? '8k' : '4k';
  const pick = (sizes) => (sizes[size] ? { url: sizes[size], size } : { url: sizes[other], size: other });
  const entries = new Map();
  for (const [id, sizes] of Object.entries(catalog)) entries.set(id, { key: id, ...pick(sizes) });
  for (const [id, layer] of Object.entries(layers)) entries.set(`layer:${id}`, { key: `layer:${id}`, ...pick(layer.files), rect: layer.rect });
  if (!entries.size) log('assets/pano에 렌더가 없음 → 테스트 격자·와이어프레임으로 표시');

  const loads = new Map(); // key -> Promise<Texture|null>
  let queue = [];
  let running = false;

  function load(entry) {
    if (loads.has(entry.key)) return loads.get(entry.key);
    const t0 = performance.now();
    const name = entry.key.replace('layer:', '레이어 ');
    const p = viewer.loadTexture(entry.url, maxWidth).then(
      (texture) => {
        const w = texture.image.width ?? texture.image.naturalWidth;
        log(`${name} 준비 (${entry.size.toUpperCase()} → ${w}px, ${((performance.now() - t0) / 1000).toFixed(1)}초)`);
        return texture;
      },
      (err) => {
        log(`${name} 불러오기 실패`);
        console.error(err);
        return null;
      },
    );
    loads.set(entry.key, p);
    return p;
  }

  async function pump() {
    if (running) return;
    running = true;
    while (queue.length) await load(queue.shift());
    running = false;
  }

  let chapter = null;
  // 이 장의 파일을 차례로 불러오고, 다른 장의 텍스처는 내린다
  function focusChapter(name) {
    if (name === chapter) return;
    chapter = name;
    const keep = new Set(CHAPTERS[name]);
    for (const [key, p] of loads) {
      if (keep.has(key)) continue;
      loads.delete(key);
      setTimeout(() => p.then((t) => t?.dispose()), 3000); // 크로스페이드가 끝난 뒤에 내린다
    }
    // 레이어로 대신할 수 있는 통째 렌더는 불러오지 않는다
    const wanted = CHAPTERS[name].filter((key) => entries.has(key) && !(LAYERS[key] && layers[key]));
    queue = wanted.map((key) => entries.get(key));
    setTimeout(pump, 0); // 지금 띄울 장면이 먼저 순서를 당길 수 있게 한 박자 늦게 시작
  }

  function get(key) {
    const entry = entries.get(key);
    if (!entry) return Promise.resolve(null);
    const i = queue.indexOf(entry);
    if (i >= 0) queue.splice(i, 1);
    return load(entry);
  }

  const made = new Map();
  const once = (key, fn) => (made.has(key) ? made.get(key) : (made.set(key, fn()), made.get(key)));
  const testTexture = (pano) =>
    once(`test:${pano}`, () => viewer.canvasTexture(makeTestPano({ tint: TINTS[pano], label: `${PANOS[pano]?.name ?? pano} · 렌더 없음` })));
  function wireLayer(kind, option) {
    return once(`wire:${kind}:${option}`, () => {
      const rect = PLACEHOLDER_RECT[kind];
      const label = kind === 'island' ? `아일랜드 ${option.toUpperCase()} · ${ISLANDS[option]?.name ?? ''}` : `바닥재 · ${FLOORS[option]?.name ?? option}`;
      const color = kind === 'island' ? ISLAND_TINT[option] : FLOORS[option]?.swatch;
      return { texture: viewer.canvasTexture(makePlaceholderLayer({ kind, rect, label, color })), rect };
    });
  }

  // 레이어 하나 → { layer, part }
  async function resolveLayer(pano, kind, option) {
    if (!option) return { layer: null, part: null };
    const id = layerIdFor(pano, kind, option);
    if (id && layers[id]) {
      const texture = await get(`layer:${id}`);
      if (texture) return { layer: { texture, rect: layers[id].rect }, part: 'cut' };
    }
    return { layer: wireLayer(kind, option), part: 'wire' };
  }

  return {
    catalog,
    layers,
    /** 장면 { pano, island, floor } → { base, island, floor, parts } */
    async sceneFor({ pano, island = null, floor = null }) {
      if (!pano) return { base: null, island: null, floor: null, parts: {} };
      focusChapter(chapterOf(pano));
      const islandId = layerIdFor(pano, 'island', island);
      // 누끼는 없고 아일랜드 통째 렌더만 있으면(바닥재 변경 전) 그 렌더를 배경으로 쓴다
      if (islandId && !layers[islandId] && catalog[islandId] && !floor) {
        const full = await get(islandId);
        if (full) return { base: full, island: null, floor: null, parts: { base: 'render', island: 'full' } };
      }
      const [base, i, f] = await Promise.all([catalog[pano] ? get(pano) : null, resolveLayer(pano, 'island', island), resolveLayer(pano, 'floor', floor)]);
      return {
        base: base ?? testTexture(pano),
        island: i.layer,
        floor: f.layer,
        parts: { base: base ? 'render' : 'test', island: i.part, floor: f.part },
      };
    },
    /** 실제 파노라마 위에 겹쳐 보는 방위 격자(투명 배경) */
    gridOverlay() {
      return once('grid', () => viewer.canvasTexture(makeTestPano({ transparent: true })));
    },
  };
}

const sceneKey = (s) => `${s.pano}|${s.island}|${s.floor}`;

/**
 * 장면 { pano, island, floor }을 화면에 반영한다. 두 화면 공용.
 *  - 공간(pano)이 바뀌면 크로스페이드
 *  - 같은 공간이면 배경은 그대로 두고 레이어만 연출과 함께 바꾼다(아일랜드 = 배치, 바닥재 = 발밑부터 칠하기)
 * 목록을 받기 전에 들어온 장면은 기억해 뒀다가 준비되면 바로 띄운다.
 */
export function createScenePlayer(viewer, { onChange = () => {}, ...options }) {
  let set = null;
  let pending = null;
  let token = 0;
  let current = null; // { want, scene }
  const player = {
    parts: {},
    get current() {
      return current?.want ?? null;
    },
    async show(want, { delay = 0, fadeMs } = {}) {
      pending = [want, { delay, fadeMs }];
      if (!set) return;
      if (current && sceneKey(current.want) === sceneKey(want)) return;
      const mine = ++token;
      const scene = await set.sceneFor(want);
      if (mine !== token) return;

      const prev = current;
      current = { want: { ...want }, scene };
      player.parts = scene.parts;
      onChange(player);

      const sameSpace = prev && prev.want.pano === want.pano && prev.scene.base === scene.base && scene.base;
      if (!sameSpace) {
        viewer.showStack(scene, { fadeMs: prev?.scene.base ? fadeMs : 0 });
        return;
      }
      if (prev.scene.island?.texture !== scene.island?.texture) {
        viewer.setLayer('island', scene.island, { effect: scene.island ? 'place' : 'swap', delay });
      }
      if (prev.scene.floor?.texture !== scene.floor?.texture) {
        viewer.setLayer('floor', scene.floor, { effect: scene.floor ? 'paint' : 'swap', delay });
      }
    },
  };
  player.ready = createPanoSet(viewer, options).then((s) => {
    set = s;
    player.set = s;
    onChange(player);
    if (pending) player.show(...pending);
    return s;
  });
  return player;
}
