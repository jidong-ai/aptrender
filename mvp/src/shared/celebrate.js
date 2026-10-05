// 엔딩 보상 연출: 색종이(캔버스 파티클)와 숫자 카운트업. 태블릿·XR 공용
const COLORS = ['#1aa0ff', '#205ba5', '#ffc93c', '#ff460e', '#ffffff', '#7fd1ff'];

/** container 위에 색종이를 터뜨린다. 끝나면 캔버스를 지운다 */
export function confetti(container, { count = 140, duration = 3200, origin = { x: 0.5, y: 0.35 } } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  container.append(canvas);
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = (canvas.width = container.clientWidth * dpr);
  const H = (canvas.height = container.clientHeight * dpr);
  const g = canvas.getContext('2d');
  const parts = Array.from({ length: count }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const v = (0.6 + Math.random() * 0.9) * H * 0.0022;
    return {
      x: origin.x * W,
      y: origin.y * H,
      vx: Math.cos(a) * v * (0.6 + Math.random()),
      vy: Math.sin(a) * v * 1.4,
      w: (6 + Math.random() * 8) * dpr,
      h: (4 + Math.random() * 6) * dpr,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: COLORS[(Math.random() * COLORS.length) | 0],
    };
  });
  const start = performance.now();
  let last = start;
  (function frame(now) {
    const dt = Math.min(40, now - last);
    last = now;
    const t = (now - start) / duration;
    g.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.0016 * H * (dt / 1000) * 2.2; // 중력
      p.vx *= 0.995;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr;
      g.save();
      g.globalAlpha = Math.max(0, 1 - Math.max(0, t - 0.7) / 0.3);
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.fillStyle = p.c;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, Math.abs(Math.cos(p.r * 2)) * p.h + 1);
      g.restore();
    }
    if (t < 1) requestAnimationFrame(frame);
    else canvas.remove();
  })(start);
}

/** el의 숫자를 0부터 to까지 올린다. format(n) → 표시 문자열 */
export function countUp(el, to, { duration = 1200, delay = 0, format = (n) => String(Math.round(n)) } = {}) {
  el.textContent = format(0);
  setTimeout(() => {
    const start = performance.now();
    (function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = format(to * (1 - (1 - t) ** 3));
      if (t < 1) requestAnimationFrame(frame);
    })(start);
  }, delay);
}
