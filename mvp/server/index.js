import qrcode from 'qrcode-terminal';
import { startServer } from './app.js';
import { getLanAddresses } from './lan.js';

const prod = process.argv.includes('--prod');
const port = Number(process.env.PORT) || 3000;

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const bold = (s) => (tty ? `\x1b[1m${s}\x1b[22m` : s);
const cyan = (s) => (tty ? `\x1b[36m${s}\x1b[39m` : s);
const dim = (s) => (tty ? `\x1b[2m${s}\x1b[22m` : s);
const yellow = (s) => (tty ? `\x1b[33m${s}\x1b[39m` : s);

// 한글은 터미널에서 2칸을 차지하므로 정렬용 폭을 따로 계산
const width = (s) => [...s].reduce((n, ch) => n + (/[ᄀ-ᇿ㄰-㆏가-힣]/.test(ch) ? 2 : 1), 0);
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));

function printBanner(server) {
  const lan = getLanAddresses();
  const [main, ...others] = lan;
  const tabletUrl = main && `http://${main.address}:${server.port}/tablet`;
  const line = dim('─'.repeat(56));

  console.log();
  console.log(line);
  console.log(`  ${bold('Weave MVP 서버')}  ·  ${prod ? '전시(빌드) 모드' : '개발 모드'}  ·  포트 ${server.port}`);
  console.log(line);
  console.log();
  if (tabletUrl) {
    console.log(`  ${pad('아이패드 (태블릿)', 22)}${cyan(bold(tabletUrl))}`);
  } else {
    console.log(`  ${yellow('LAN 주소를 찾지 못했습니다. 와이파이 연결을 확인하세요.')}`);
  }
  console.log(`  ${pad('이 컴퓨터 (XR 화면)', 22)}${cyan(`http://localhost:${server.port}/xr`)}`);
  console.log();

  if (tabletUrl) {
    qrcode.generate(tabletUrl, { small: true }, (qr) => {
      console.log(qr.replace(/^/gm, '  '));
    });
    console.log(`  ${dim('↑ 아이패드 카메라로 QR을 비추면 태블릿 화면이 열립니다.')}`);
    console.log();
  }
  if (others.length) {
    console.log(dim('  다른 주소 후보 (위 주소로 안 열릴 때):'));
    for (const { name, address } of others) {
      console.log(dim(`    http://${address}:${server.port}/tablet  (${name})`));
    }
    console.log();
  }
  console.log(dim('  아이패드에서 안 열리면 README의 "안 될 때"를 확인하세요.  종료: Ctrl+C'));
  console.log(line);
  console.log();
}

let server;
try {
  server = await startServer({ port, mode: prod ? 'prod' : 'dev' });
} catch (err) {
  if (err.code === 'EADDRINUSE') {
    console.error(yellow(`\n  ${port} 포트를 이미 다른 프로그램이 쓰고 있습니다.`));
    console.error(`  이전에 켠 서버 창이 남아 있는지 확인하거나, 다른 포트로 실행하세요:  PORT=3001 npm run dev\n`);
  } else if (err.code === 'NO_DIST') {
    console.error(yellow(`\n  ${err.message}\n`));
  } else {
    console.error(err);
  }
  process.exit(1);
}

printBanner(server);

let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (closing) process.exit(1);
    closing = true;
    console.log('\n  서버를 종료합니다…');
    await server.close();
    process.exit(0);
  });
}
