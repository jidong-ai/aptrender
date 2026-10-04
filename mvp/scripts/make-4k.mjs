// 8K 파노라마만 렌더하면 아이패드용 4K(4096×2048 JPG)를 자동으로 만든다.
// macOS 기본 도구 sips를 쓰므로 따로 설치할 것이 없다.  실행: npm run pano:4k
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePanoFile } from '../src/shared/scene.js';

const DIR = fileURLToPath(new URL('../assets/pano/', import.meta.url));
const force = process.argv.includes('--force');

try {
  execFileSync('sips', ['--help'], { stdio: 'ignore' });
} catch {
  console.error('sips를 찾을 수 없습니다. 이 스크립트는 macOS에서 실행하세요.');
  process.exit(1);
}

const files = fs.readdirSync(DIR);
const have4k = new Set(files.map(parsePanoFile).filter((p) => p?.size === '4k').map((p) => p.key));
let made = 0;

for (const file of files) {
  const parsed = parsePanoFile(file);
  if (!parsed || parsed.size !== '8k' || parsed.legacy) continue;
  if (have4k.has(parsed.key) && !force) continue;
  const out = file.replace(/_8k\.[a-z]+$/i, '_4k.jpg');
  process.stdout.write(`${file} → ${out} … `);
  execFileSync('sips', ['-z', '2048', '4096', '-s', 'format', 'jpeg', '-s', 'formatOptions', '88', path.join(DIR, file), '--out', path.join(DIR, out)], {
    stdio: 'ignore',
  });
  console.log('완료');
  made += 1;
}

console.log(made ? `\n4K ${made}장을 만들었습니다.` : '새로 만들 4K가 없습니다. (이미 있으면 건너뜀, 다시 만들려면 --force)');
