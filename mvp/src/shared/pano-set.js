import { makeTestPano } from './test-pano.js';
import { describeScene, sceneKey } from './scene.js';

// 렌더가 없는 시점은 바닥재마다 색조만 다른 테스트 파노라마로 대신한다.
const TINTS = { base: '#e4e4e4', a: '#dcbcb2', b: '#b4c3dc', c: '#b8d6c7' };

export const MODE_TEXT = {
  layers: '배경 고정 + 레이어',
  full: '렌더 통째 교체(npm run pano:prep 필요)',
  missing: '렌더 준비 중(배경 유지)',
  test: '테스트 격자',
};

/**
 * /api/panos 목록을 받아 이 화면에 맞는 크기로 전부 미리 불러온다.
 *  - size: '4k'(태블릿) | '8k'(XR). 원하는 크기가 없으면 다른 크기로 대체
 *  - maxWidth: 텍스처 최대 가로 픽셀. 넘으면 줄여서 올린다
 *
 * 장면을 보여주는 방식(status)
 *  - layers : 시점의 기본 배경(아일랜드 없음·기존 바닥) 위에 오려낸 레이어를 겹친다. 공간은 그대로, 오브제·자재만 바뀐다
 *  - full   : 레이어가 아직 없고 해당 조합의 렌더만 있음 → 렌더를 통째로 교체
 *  - missing: 배경은 있지만 이 조합의 렌더가 없음 → 배경만 유지
 *  - test   : 이 시점의 배경 렌더가 없음 → 테스트 격자
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
  for (const [key, sizes] of Object.entries(catalog)) entries.set(key, { key, ...pick(sizes) });
  for (const [key, layer] of Object.entries(layers)) entries.set(`layer:${key}`, { key: `layer:${key}`, ...pick(layer.files), rect: layer.rect });
  if (!entries.size) log('assets/pano에 렌더가 없음 → 테스트 격자로 표시');

  // 한 장씩 차례로 불러온다(메모리 급증 방지). 지금 필요한 장은 순서를 앞당긴다. 배경을 레이어보다 먼저
  const loads = new Map(); // key -> Promise<Texture|null>
  // 레이어로 대신할 수 있는 통째 렌더는 미리 불러오지 않는다(아이패드·아이맥 메모리 절약)
  const coveredByLayer = (key) => layers[key] && catalog[`${key.split('_')[0]}_none_base`];
  const queue = [...entries.values()]
    .filter((e) => !coveredByLayer(e.key))
    .sort((a, b) => a.key.startsWith('layer:') - b.key.startsWith('layer:'));
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
  setTimeout(pump, 0); // 화면에 띄울 장면이 먼저 순서를 당길 수 있게 한 박자 늦게 시작

  function get(key) {
    const entry = entries.get(key);
    if (!entry) return Promise.resolve(null);
    const i = queue.indexOf(entry);
    if (i >= 0) queue.splice(i, 1);
    return load(entry);
  }
  async function layer(key) {
    const texture = await get(`layer:${key}`);
    return texture ? { texture, rect: layers[key].rect } : null;
  }

  const tests = new Map();
  function testTexture(spot, island, floor) {
    const key = sceneKey(spot, island, floor);
    if (!tests.has(key)) {
      const canvas = makeTestPano({ tint: TINTS[floor], label: `${describeScene(spot, island, floor)} · 렌더 없음` });
      tests.set(key, viewer.canvasTexture(canvas));
    }
    return tests.get(key);
  }

  function status(spot, island, floor) {
    const full = sceneKey(spot, island, floor);
    if (!catalog[sceneKey(spot, 'none', 'base')]) return catalog[full] ? 'full' : 'test';
    const needIsland = island !== 'none' && !layers[sceneKey(spot, island, 'base')];
    const needFloor = floor !== 'base' && !layers[full];
    if (!needIsland && !needFloor) return 'layers';
    return catalog[full] ? 'full' : 'missing';
  }

  let gridOverlay = null;

  return {
    catalog,
    layers,
    status,
    /** 이 조합을 실제 렌더로 보여줄 수 있는가(버튼 점선 표시용) */
    available: (spot, island, floor) => ['layers', 'full'].includes(status(spot, island, floor)),
    /** 장면 → { mode, base, island, floor } (island·floor = 오려낸 레이어 또는 null) */
    async sceneFor(spot, island, floor) {
      const mode = status(spot, island, floor);
      const full = sceneKey(spot, island, floor);
      if (mode === 'test') return { mode, base: testTexture(spot, island, floor), island: null, floor: null };
      if (mode === 'full') return { mode, base: (await get(full)) ?? testTexture(spot, island, floor), island: null, floor: null };
      const [base, islandLayer, floorLayer] = await Promise.all([
        get(sceneKey(spot, 'none', 'base')),
        island !== 'none' ? layer(sceneKey(spot, island, 'base')) : null,
        floor !== 'base' ? layer(full) : null,
      ]);
      return { mode, base: base ?? testTexture(spot, island, floor), island: islandLayer, floor: floorLayer };
    },
    /** 실제 파노라마 위에 겹쳐 보는 방위 격자(투명 배경) */
    gridOverlay() {
      gridOverlay ??= viewer.canvasTexture(makeTestPano({ transparent: true }));
      return gridOverlay;
    },
  };
}

/**
 * 장면(시점·아일랜드·바닥재)을 받아 화면에 반영한다. 두 화면 공용.
 *  - 시점이 바뀌면 장면 전체를 크로스페이드
 *  - 같은 시점이면 배경은 그대로 두고 레이어만 연출과 함께 바꾼다(아일랜드 = 배치, 바닥재 = 칠하기)
 * 목록을 받기 전에 들어온 장면은 기억해 뒀다가 준비되면 바로 띄운다.
 */
export function createScenePlayer(viewer, { onChange = () => {}, ...options }) {
  let panos = null;
  let pending = null;
  let token = 0;
  let current = null; // { spot, island, floor, scene }
  const player = {
    mode: '-',
    get panos() {
      return panos;
    },
    async show(spot, island, floor, { delay = 0 } = {}) {
      pending = [spot, island, floor];
      if (!panos) return;
      const key = sceneKey(spot, island, floor);
      if (current && key === sceneKey(current.spot, current.island, current.floor)) return;
      const mine = ++token;
      const scene = await panos.sceneFor(spot, island, floor);
      if (mine !== token) return;

      const prev = current;
      current = { spot, island, floor, scene };
      player.mode = scene.mode;
      onChange(player);

      const sameSpace = prev && prev.spot === spot && prev.scene.base === scene.base && prev.scene.mode !== 'full' && scene.mode !== 'full';
      if (!sameSpace) {
        viewer.showStack(scene, { fadeMs: prev ? undefined : 0 });
        return;
      }
      if (prev.scene.island?.texture !== scene.island?.texture) {
        viewer.setLayer('island', scene.island, { effect: prev.island !== island ? 'place' : 'swap', delay });
      }
      if (prev.scene.floor?.texture !== scene.floor?.texture) {
        viewer.setLayer('floor', scene.floor, { effect: prev.floor !== floor ? 'paint' : 'swap', delay });
      }
    },
  };
  player.ready = createPanoSet(viewer, options).then((set) => {
    panos = set;
    onChange(player);
    if (pending) player.show(...pending);
    return set;
  });
  return player;
}
