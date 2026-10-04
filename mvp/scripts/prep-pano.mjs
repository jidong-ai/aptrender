// D5 8K 렌더를 화면용으로 준비한다. 윈도우·맥 공통.  실행: npm run pano:prep
//  - 아이패드용 4K(4096×2048 JPG)를 만든다
//  - 원본이 PNG면 아이맥용 8K JPG도 만든다(PNG보다 훨씬 가벼워 XR 화면이 덜 멈춘다. 서버는 JPG를 우선 사용)
// 이미 만든 파일은 건너뛴다. 다시 만들려면 npm run pano:prep -- --force
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parsePanoFile } from '../src/shared/scene.js';

const DIR = fileURLToPath(new URL('../assets/pano/', import.meta.url));
const force = process.argv.includes('--force');

sharp.cache(false); // 8K를 연달아 처리할 때 메모리를 바로 돌려준다

const files = fs.readdirSync(DIR);
const exists = new Set(files.map((f) => f.toLowerCase()));
let made = 0;

async function convert(file, out, width, quality) {
  if (exists.has(out.toLowerCase()) && !force) return;
  process.stdout.write(`${file} → ${out} … `);
  const t0 = Date.now();
  await sharp(path.join(DIR, file), { limitInputPixels: false })
    .resize(width, width / 2, { fit: 'fill' })
    .jpeg({ quality, mozjpeg: true })
    .toFile(path.join(DIR, out));
  console.log(`완료 (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  exists.add(out.toLowerCase());
  made += 1;
}

for (const file of files) {
  const parsed = parsePanoFile(file);
  if (!parsed || parsed.size !== '8k') continue;
  const stem = file.replace(/(_8k)?\.[a-z]+$/i, ''); // pano_front.png → pano_front
  await convert(file, `${stem}_4k.jpg`, 4096, 88);
  if (/\.png$/i.test(file)) await convert(file, `${stem}_8k.jpg`, 8192, 90);
}

console.log(made ? `\n${made}장을 만들었습니다.` : '새로 만들 파일이 없습니다. (이미 있으면 건너뜀, 다시 만들려면 --force)');
