// 숫자 카운트업 연출(상담 리포트의 최종 견적). 태블릿·XR 공용

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
