// D5 렌더를 화면용으로 준비한다. 윈도우·맥 공통.  실행: npm run pano:prep
// 결과는 모두 assets/pano/built/ 에 만든다(git에 올리지 않음, 지워도 다시 만들 수 있음)
//  1) 아이패드용 4K JPG
//  2) 원본이 PNG면 아이맥용 8K JPG(PNG보다 가벼워 XR 화면이 덜 멈춘다)
//  3) 오브제·자재 레이어(built/layers/)
//     - 누끼 파일(이름_cut.png)이 있으면 그걸 그대로 쓴다  ← 기본
//     - --auto 를 붙이면 누끼가 없는 조합은 "옵션 렌더 − 기본 렌더" 차이로 자동 오려낸다(미리보기용)
// 이미 만든 파일은 건너뛴다. 다시 만들려면 npm run pano:prep -- --force
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { FLOORS, ISLANDS, SPOTS, parsePanoFile, sceneKey } from '../src/shared/scene.js';

const DIR = fileURLToPath(new URL('../assets/pano/', import.meta.url));
const BUILT = path.join(DIR, 'built');
const LAYER_DIR = path.join(BUILT, 'layers');
const MANIFEST = path.join(LAYER_DIR, 'manifest.json');
const force = process.argv.includes('--force');
const auto = process.argv.includes('--auto');

// 비교는 2048×1024에서(빠르고 렌더 잡음에 덜 민감). 결과 마스크를 4K·8K로 키워 쓴다
const DW = 2048;
const DH = 1024;
const DIFF_THRESHOLD = 16; // 0~255. 이보다 작게 달라진 픽셀은 같은 것으로 본다(렌더 잡음)
const WARN_COVERAGE = 0.3; // 화면의 30% 넘게 바뀌면 카메라·노출이 다른 렌더일 가능성

sharp.cache(false); // 8K를 연달아 처리할 때 메모리를 바로 돌려준다
const sec = (t0) => `${((Date.now() - t0) / 1000).toFixed(1)}초`;
const open = (file) => sharp(path.join(DIR, file), { limitInputPixels: false });

const files = fs.readdirSync(DIR).filter((f) => fs.statSync(path.join(DIR, f)).isFile());
fs.mkdirSync(LAYER_DIR, { recursive: true });
const exists = new Set(fs.readdirSync(BUILT).map((f) => f.toLowerCase()));
let made = 0;

// ---------- 1·2) 4K·8K JPG ----------
async function convert(file, out, width, quality) {
  if (exists.has(out.toLowerCase()) && !force) return;
  process.stdout.write(`${file} → ${out} … `);
  const t0 = Date.now();
  await open(file).resize(width, width / 2, { fit: 'fill' }).jpeg({ quality, mozjpeg: true }).toFile(path.join(BUILT, out));
  console.log(`완료 (${sec(t0)})`);
  exists.add(out.toLowerCase());
  made += 1;
}

// 장면별 원본(8K). PNG가 있으면 PNG(무손실)를 비교 원본으로 쓴다
const sources = {};
const cuts = {};
for (const file of files) {
  const parsed = parsePanoFile(file);
  if (parsed?.cut) {
    cuts[parsed.key] = file;
    continue;
  }
  if (!parsed || parsed.size !== '8k') continue;
  const stem = file.replace(/(_8k)?\.[a-z]+$/i, ''); // pano_front.png → pano_front
  await convert(file, `${stem}_4k.jpg`, 4096, 88);
  if (/\.png$/i.test(file)) await convert(file, `${stem}_8k.jpg`, 8192, 90);
  if (!sources[parsed.key] || /\.png$/i.test(file)) sources[parsed.key] = file;
}

// ---------- 3) 레이어 ----------
const pairs = [];
for (const spot of SPOTS) {
  for (const island of ISLANDS.filter((i) => i !== 'none')) {
    const withIsland = sceneKey(spot, island, 'base');
    const base = sources[sceneKey(spot, 'none', 'base')];
    if (base && (cuts[withIsland] || (auto && sources[withIsland]))) {
      pairs.push({ key: withIsland, kind: 'island', cut: cuts[withIsland], from: base, to: sources[withIsland] });
    }
    for (const floor of FLOORS.filter((f) => f !== 'base')) {
      const withFloor = sceneKey(spot, island, floor);
      if (base && (cuts[withFloor] || (auto && sources[withFloor] && sources[withIsland]))) {
        pairs.push({ key: withFloor, kind: 'floor', cut: cuts[withFloor], from: sources[withIsland], to: sources[withFloor] });
      }
    }
  }
}

let manifest = { version: 1, layers: {} };
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
} catch {}
const signature = (file) => `${file}@${Math.round(fs.statSync(path.join(DIR, file)).mtimeMs)}`;

const blur = (buf, sigma) => sharp(buf, { raw: { width: DW, height: DH, channels: 1 } }).blur(sigma).extractChannel(0).raw().toBuffer();
const threshold = (buf, t) => {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] > t ? 255 : 0;
  return out;
};

// 누끼 파일 → 레이어. 투명하지 않은 부분만 잘라 4K·8K로 저장한다
async function makeLayerFromCut(pair) {
  const t0 = Date.now();
  const meta = await open(pair.cut).metadata();
  if (!meta.hasAlpha) {
    console.log(`  ! ${pair.cut}: 투명 배경이 없습니다. 누끼를 딴 뒤 PNG(투명)로 저장하세요`);
    return null;
  }
  if (Math.abs(meta.width / meta.height - 2) > 0.01) {
    console.log(`  ! ${pair.cut}: 크기가 ${meta.width}×${meta.height}입니다. 원본 파노라마와 같은 크기(가로:세로 2:1)로, 자르지 말고 저장하세요`);
    return null;
  }
  const alpha = await open(pair.cut).resize(DW, DH, { fit: 'fill' }).extractChannel('alpha').raw().toBuffer();
  return writeLayer(pair, alpha, (W, H, area) => open(pair.cut).resize(W, H, { fit: 'fill' }).extract(area).ensureAlpha().raw().toBuffer(), 4, t0, '누끼');
}

async function makeLayer(pair) {
  if (pair.cut) return makeLayerFromCut(pair);
  const t0 = Date.now();
  const small = (file) => open(file).removeAlpha().resize(DW, DH, { fit: 'fill' }).raw().toBuffer();
  const [A, B] = await Promise.all([small(pair.from), small(pair.to)]);

  // 두 렌더의 전체 밝기 차이(노출)를 맞춘 뒤 비교한다
  const sa = [0, 0, 0];
  const sb = [0, 0, 0];
  for (let i = 0; i < A.length; i++) {
    sa[i % 3] += A[i];
    sb[i % 3] += B[i];
  }
  const gain = sa.map((v, c) => (sb[c] ? v / sb[c] : 1));

  const diff = Buffer.alloc(DW * DH);
  for (let p = 0, i = 0; p < diff.length; p++, i += 3) {
    const d = Math.max(Math.abs(A[i] - B[i] * gain[0]), Math.abs(A[i + 1] - B[i + 1] * gain[1]), Math.abs(A[i + 2] - B[i + 2] * gain[2]));
    diff[p] = Math.min(255, d);
  }

  let mask = threshold(await blur(diff, 1.2), DIFF_THRESHOLD); // 잡음을 누른 뒤 바뀐 픽셀
  mask = threshold(await blur(mask, 2), 150); // 흩어진 작은 점 제거
  mask = threshold(await blur(mask, 4), 30); // 오브제 테두리·그림자를 넉넉히 포함
  const alpha = await blur(mask, 1.5); // 경계를 부드럽게

  const rgb = (W, H, area) => open(pair.to).removeAlpha().resize(W, H, { fit: 'fill' }).linear(gain, [0, 0, 0]).extract(area).raw().toBuffer();
  return writeLayer(pair, alpha, rgb, 3, t0, '자동');
}

// alpha(DW×DH 마스크)로 잘라낼 영역을 정하고, 4K·8K 레이어(webp)를 쓴다
async function writeLayer(pair, alpha, readPixels, channels, t0, how) {
  let minX = DW;
  let minY = DH;
  let maxX = -1;
  let maxY = -1;
  let covered = 0;
  for (let y = 0; y < DH; y++) {
    for (let x = 0; x < DW; x++) {
      const a = alpha[y * DW + x];
      if (a > 128) covered += 1;
      if (a <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) {
    console.log(`  ! ${pair.key}: 남은 부분이 없습니다. 파일을 확인하세요 (${pair.cut ?? pair.to})`);
    return null;
  }
  const coverage = covered / (DW * DH);
  if (!pair.cut && coverage > WARN_COVERAGE) {
    console.log(`  ! ${pair.key}: 화면의 ${Math.round(coverage * 100)}%가 바뀌었습니다. 두 렌더의 카메라 위치나 노출이 다른 것 같습니다(D5 노출 수동 고정 권장)`);
  }

  const pad = 6;
  let rect = [Math.max(0, minX - pad) / DW, Math.max(0, minY - pad) / DH, Math.min(DW, maxX + 1 + pad) / DW, Math.min(DH, maxY + 1 + pad) / DH];
  if (rect[2] - rect[0] > 0.6) rect = [0, rect[1], 1, rect[3]]; // 이음매(±180°)에 걸치면 가로 전체
  rect = rect.map((v) => Math.round(v * 1e5) / 1e5);

  const outFiles = {};
  for (const [size, W] of [['4k', 4096], ['8k', 8192]]) {
    const H = W / 2;
    const left = Math.floor(rect[0] * W);
    const top = Math.floor(rect[1] * H);
    const width = Math.min(W, Math.ceil(rect[2] * W)) - left;
    const height = Math.min(H, Math.ceil(rect[3] * H)) - top;
    const area = { left, top, width, height };
    const pixels = await readPixels(W, H, area);
    let image = sharp(pixels, { raw: { width, height, channels } });
    if (channels === 3) {
      const a = await sharp(alpha, { raw: { width: DW, height: DH, channels: 1 } }).resize(W, H, { fit: 'fill' }).extract(area).extractChannel(0).raw().toBuffer();
      image = image.joinChannel(a, { raw: { width, height, channels: 1 } });
    }
    const name = `${pair.key}_${size}.webp`;
    await image.webp({ quality: 90, alphaQuality: 95, exact: true, effort: 4 }).toFile(path.join(LAYER_DIR, name));
    outFiles[size] = `built/layers/${name}`;
  }
  const kindName = pair.kind === 'island' ? '아일랜드' : '바닥재';
  console.log(`  ${pair.key} (${kindName}, ${how}) 화면의 ${(coverage * 100).toFixed(1)}% · ${sec(t0)}`);
  return { kind: pair.kind, rect, coverage: Math.round(coverage * 1e4) / 1e4, files: outFiles };
}

if (pairs.length) {
  console.log(`\n레이어 오려내기 (${pairs.length}개 조합)`);
  const next = { version: 1, layers: {} };
  for (const pair of pairs) {
    const sig = pair.cut ? [signature(pair.cut), signature(pair.from)] : [signature(pair.from), signature(pair.to), 'auto'];
    const old = manifest.layers?.[pair.key];
    const fresh = old && JSON.stringify(old.sources) === JSON.stringify(sig) && Object.values(old.files).every((f) => fs.existsSync(path.join(DIR, f)));
    if (fresh && !force) {
      next.layers[pair.key] = old;
      continue;
    }
    const layer = await makeLayer(pair);
    if (layer) {
      next.layers[pair.key] = { ...layer, sources: sig };
      made += 1;
    }
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(next, null, 2));
} else if (fs.existsSync(MANIFEST)) {
  fs.writeFileSync(MANIFEST, JSON.stringify({ version: 1, layers: {} }, null, 2));
}

console.log(made ? `\n${made}개를 만들었습니다.` : '새로 만들 파일이 없습니다. (이미 있으면 건너뜀, 다시 만들려면 --force)');
