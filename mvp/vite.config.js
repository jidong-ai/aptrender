import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (name) => fileURLToPath(new URL(`./${name}.html`, import.meta.url));

// 개발 서버는 따로 띄우지 않는다. server/app.js가 Vite를 미들웨어로 붙여
// 포트 3000 하나로 페이지·WebSocket·파일을 모두 서빙한다.
export default defineConfig({
  publicDir: false,
  server: {
    allowedHosts: ['.local'], // IP 주소·localhost는 기본 허용, imac.local 같은 이름도 허용
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'static', // /assets 경로는 파노라마·UI 원본 폴더용으로 비워둔다
    rolldownOptions: {
      input: { index: page('index'), tablet: page('tablet'), xr: page('xr') },
    },
  },
});
