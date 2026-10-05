// 게임형 가이드: 지금 눌러야 할 곳만 밝히고(펄스 링 + 지시문), 다른 버튼은 막는다.
//  - 파노라마 드래그는 항상 허용
//  - 대상이 아닌 버튼을 누르면 대상이 살짝 흔들린다
//  - data-free 요소(주석 도구 등)와 직원 메뉴는 언제나 누를 수 있다

const PAD = 10; // 링과 대상 사이 여백(px, 화면 기준)

export function createCoach({ root, hole, label, onBlocked = () => {} }) {
  let goal = null; // { match(el), find(): Element[] | null, rect(): DOMRect | null, text, dim }

  function allowed(el) {
    if (!goal) return false;
    const btn = el.closest('[data-target]');
    return Boolean(btn && goal.match(btn));
  }

  function shake() {
    const els = goal?.find?.() ?? [];
    for (const el of els) {
      el.classList.remove('shake');
      void el.offsetWidth; // 애니메이션 재시작
      el.classList.add('shake');
    }
    hole.classList.remove('shake');
    void hole.offsetWidth;
    hole.classList.add('shake');
  }

  // 막을 대상: data-target이 달린 버튼 중 지금 대상이 아닌 것
  function gate(e) {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    if (el.closest('[data-free], .staff, .idle, .staff-zone')) return;
    const btn = el.closest('[data-target]');
    if (!btn) return;
    if (allowed(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'click') {
      shake();
      onBlocked(btn.dataset.target);
    }
  }
  document.addEventListener('click', gate, true);
  document.addEventListener('pointerdown', gate, true);

  function place() {
    requestAnimationFrame(place);
    if (!goal) {
      root.hidden = true;
      return;
    }
    const r = goal.rect();
    if (!r) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    root.classList.toggle('dim', Boolean(goal.dim));
    const round = goal.round ?? Math.min(r.width, r.height) / 2 + PAD;
    Object.assign(hole.style, {
      left: `${r.left - PAD}px`,
      top: `${r.top - PAD}px`,
      width: `${r.width + PAD * 2}px`,
      height: `${r.height + PAD * 2}px`,
      borderRadius: `${round}px`,
    });
    label.textContent = goal.text ?? '';
    label.hidden = !goal.text;
    const below = r.top + r.height / 2 < innerHeight * 0.55;
    label.dataset.side = below ? 'below' : 'above';
    const lw = label.offsetWidth;
    const lh = label.offsetHeight;
    const x = Math.min(innerWidth - lw - 12, Math.max(12, r.left + r.width / 2 - lw / 2));
    const y = below ? r.bottom + PAD + 18 : r.top - PAD - 18 - lh;
    label.style.left = `${x}px`;
    label.style.top = `${y}px`;
  }
  requestAnimationFrame(place);

  /** 여러 요소를 감싸는 사각형 */
  const union = (els) => {
    const rects = els.map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    if (!rects.length) return null;
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  };

  return {
    /** UI 버튼 대상: target 이름 + (선택) 허용 값 */
    ui(target, values, text, { dim = true } = {}) {
      const match = (el) => el.dataset.target === target && (!values || values.includes(el.dataset.value));
      const find = () => [...document.querySelectorAll(`[data-target="${CSS.escape(target)}"]`)].filter(match).filter((el) => el.offsetParent);
      goal = { match, find, rect: () => union(find()), text, dim };
    },
    /** 공간 대상(핫스팟·체크 자리): rect()가 화면 사각형을 준다. 누를 수 있는 요소면 match로 허용 */
    spatial({ rect, text, match = () => false, find = () => [] }) {
      goal = { match, find, rect, text, dim: false };
    },
    clear() {
      goal = null;
    },
    allowed,
    shake,
  };
}
