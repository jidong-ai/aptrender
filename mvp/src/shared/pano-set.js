import { makeTestPano } from './test-pano.js';

// 렌더가 없는 조합은 색조만 다른 테스트 파노라마로 대신한다.
const TINTS = { white: '#e4e4e4', A: '#dcbcb2', B: '#b4c3dc', C: '#b8d6c7' };
export const LIGHT_NAMES = { day: '주광', warm3000: '전구색 3000K', cool6500: '주광색 6500K' };

/**
 * /api/panos 목록을 받아 이 화면에 맞는 크기로 전부 미리 불러온다.
 *  - size: '4k'(태블릿) | '8k'(XR). 원하는 크기가 없으면 다른 크기로 대체
 *  - maxWidth: 텍스처 최대 가로 픽셀. 넘으면 줄여서 올린다
 * textureFor(preset, light)는 실사가 있으면 실사, 없으면 테스트 파노라마를 돌려준다.
 */
export async function createPanoSet(viewer, { size, maxWidth, log = () => {} }) {
  let catalog = {};
  try {
    catalog = (await (await fetch('/api/panos')).json()).panos;
  } catch {
    log('파노라마 목록을 받지 못함 → 테스트 격자로 표시');
  }

  const other = size === '4k' ? '8k' : '4k';
  const entries = Object.entries(catalog).map(([key, sizes]) => ({
    key,
    url: sizes[size] ?? sizes[other],
    size: sizes[size] ? size : other,
  }));
  if (!entries.length) log('assets/pano에 렌더가 없음 → 테스트 격자로 표시');

  // 한 장씩 차례로 불러온다(메모리 급증 방지). 지금 필요한 장은 순서를 앞당긴다.
  const loads = new Map(); // key -> Promise<Texture>
  const queue = [...entries];
  let running = false;

  function load(entry) {
    if (loads.has(entry.key)) return loads.get(entry.key);
    const t0 = performance.now();
    const p = viewer.loadTexture(entry.url, maxWidth).then(
      (texture) => {
        const w = texture.image.width ?? texture.image.naturalWidth;
        log(`파노라마 ${entry.key} 준비 (${entry.size.toUpperCase()} → ${w}px, ${((performance.now() - t0) / 1000).toFixed(1)}초)`);
        return texture;
      },
      (err) => {
        log(`파노라마 ${entry.key} 불러오기 실패 → 테스트 격자로 표시`);
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
  pump();

  const tests = new Map();
  function testTexture(preset, light) {
    const key = `${preset}_${light}`;
    if (!tests.has(key)) {
      const canvas = makeTestPano({ tint: TINTS[preset], label: `${preset} · ${LIGHT_NAMES[light]} · 렌더 없음` });
      tests.set(key, viewer.canvasTexture(canvas));
    }
    return tests.get(key);
  }

  let gridOverlay = null;

  return {
    catalog,
    hasRender: (preset, light) => Boolean(catalog[`${preset}_${light}`]),
    async textureFor(preset, light) {
      const key = `${preset}_${light}`;
      const entry = entries.find((e) => e.key === key);
      if (!entry) return testTexture(preset, light);
      const i = queue.indexOf(entry);
      if (i >= 0) queue.splice(i, 1);
      return (await load(entry)) ?? testTexture(preset, light);
    },
    /** 실제 파노라마 위에 겹쳐 보는 방위 격자(투명 배경) */
    gridOverlay() {
      gridOverlay ??= viewer.canvasTexture(makeTestPano({ transparent: true }));
      return gridOverlay;
    },
  };
}
