// Figma 디자인의 아이콘·이미지를 assets/ui/figma/ 로 받는다.  실행: npm run ui:fetch
// 아래 주소는 Figma MCP가 2026-10-05에 만든 임시 주소라 약 7일 뒤(10/12 무렵) 만료된다 ⚠️
// 만료됐으면: Figma에서 해당 레이어를 SVG/PNG로 내보내기 해서 같은 파일 이름으로 assets/ui/figma/ 에 넣으면 된다.
// 파일이 없어도 화면은 와이어프레임 아이콘으로 동작한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../assets/ui/figma/', import.meta.url));
const B = 'https://www.figma.com/api/mcp/asset';
const A = {
  tools: `${B}/cea0a2e2-1fc9-4e66-8ee6-2455cfc8ff6d`, // 상단 도구 1043:1189
  nav: `${B}/4662fdf8-5cea-448e-a945-8592e81d9ce1`, // 하단 메뉴 1043:1213
  start: `${B}/1a45dba7-3342-42f2-bb2e-3f13c23fcb3c`, // 시작화면 1043:748
  ann: `${B}/bb6cf056-c262-4f2a-967e-1cea05821080`, // 주석 도구 1043:318
  timer: `${B}/9494a845-5a8d-4886-bb7b-6e91c168c4b2`, // 타이머 1043:1208
  card: `${B}/ea208da1-a885-42b5-bf33-675bdb0807c7`, // 오늘의집 카드 1043:904
  catalog: `${B}/f47a096a-f1f8-4b41-9a94-1fa855172805`, // 카탈로그 1043:1114
  options: `${B}/9bb0e071-0066-4252-ab24-a5904e76f29e`, // 옵션수정 1043:1231
  detail: `${B}/e1c27582-b504-4683-8f05-5bed82e34245`, // 상담상세 1043:1557
  xr: `${B}/58cc14d8-5fb2-4e86-aef7-30fceb6d3e40`, // XR 상담홈 1045:1708
};

// 저장할 이름 → 주소
const FILES = {
  'measure.svg': `${A.tools}/eb38a.svg`,
  'annotate.svg': `${A.tools}/ac597.svg`,
  'options.svg': `${A.tools}/96666.svg`,
  'light.svg': `${A.tools}/4caa2.svg`,
  'person.svg': `${A.nav}/ba7b1.svg`,
  'agent.svg': `${A.nav}/74069.svg`,
  'bag.svg': `${A.nav}/28723.svg`,
  'ohouse.svg': `${A.nav}/04213.svg`,
  'start-store.png': `${A.start}/ff764.png`,
  'weave-logo.svg': `${A.start}/733f9.svg`,
  'arrow.svg': `${A.start}/3a706.svg`,
  'pencil.svg': `${A.ann}/f370e.svg`,
  'highlighter.svg': `${A.ann}/a1173.svg`,
  'pen.svg': `${A.ann}/5705f.svg`,
  'eraser.svg': `${A.ann}/43e3c.svg`,
  'stop.svg': `${A.timer}/3172a.svg`,
  'avatar.png': `${A.card}/b4183.png`,
  'close.svg': `${A.card}/3fac1.svg`,
  'help.svg': `${A.card}/ca688.svg`,
  'cat-maru.png': `${A.card}/ae024.png`,
  'cat-wallpaper.png': `${A.card}/2c493.png`,
  'cat-tile.png': `${A.card}/d5841.png`,
  'cat-object.png': `${A.card}/2426a.png`,
  'top10.png': `${A.card}/43b1b.png`,
  'island-a.png': `${A.catalog}/f36e7.png`,
  'island-b.png': `${A.catalog}/aee1a.png`,
  'island-c.png': `${A.catalog}/7e73e.png`,
  'caret.svg': `${A.options}/b503e.svg`,
  'chevron.svg': `${A.options}/a4ed3.svg`,
  'detail-floor.svg': `${A.detail}/7bd76.svg`,
  'detail-island.svg': `${A.detail}/95f63.svg`,
  'detail-light.svg': `${A.detail}/fea37.svg`,
  'refresh.svg': `${A.detail}/d90b0.svg`,
  'xr-stop.svg': `${A.xr}/3172a.svg`,
  'xr-person.svg': `${A.xr}/b78fc.svg`,
  'xr-bag.svg': `${A.xr}/85469.svg`,
  'xr-ohouse.svg': `${A.xr}/92d63.svg`,
  'xr-options.svg': `${A.xr}/cdd58.svg`,
};

fs.mkdirSync(OUT, { recursive: true });
const force = process.argv.includes('--force');
let ok = 0;
let failed = 0;
for (const [name, url] of Object.entries(FILES)) {
  const file = path.join(OUT, name);
  if (fs.existsSync(file) && !force) continue;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    ok += 1;
    console.log(`✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`× ${name} (${err.message})`);
  }
}
console.log(`\n받음 ${ok}개 · 실패 ${failed}개 → ${OUT}`);
if (failed) console.log('실패한 파일은 주소가 만료됐을 수 있습니다. Figma에서 같은 이름으로 내보내기 해 주세요. 없어도 화면은 동작합니다.');
