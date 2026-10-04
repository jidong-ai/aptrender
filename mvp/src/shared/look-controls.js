// 둘러보기 조작: 1손가락(마우스) 드래그 = 회전, 2손가락 = 핀치 확대 + 이동, 휠 = 확대.
// 손가락을 따라 장면이 움직이는 방식(오른쪽으로 끌면 왼쪽을 보게 됨). 놓으면 약간 미끄러진다.
// D5 주석 모드에서는 singleFinger = false로 1손가락을 그리기에 넘긴다.

const FRICTION_MS = 220; // 관성이 1/e로 줄어드는 시간

export function attachLookControls(viewer, { onChange = () => {}, singleFinger = true } = {}) {
  const el = viewer.renderer.domElement;
  el.style.touchAction = 'none';
  const pointers = new Map(); // id -> { x, y }
  let gesture = null;
  let velocity = { yaw: 0, pitch: 0 };
  let lastMove = 0;
  const state = { enabled: true, singleFinger };

  const degPerPx = () => viewer.vFov / el.clientHeight;
  const changed = () => onChange(viewer.getView());

  function startGesture() {
    const pts = [...pointers.values()];
    velocity = { yaw: 0, pitch: 0 };
    if (pts.length === 1) {
      gesture = { kind: 'drag', x: pts[0].x, y: pts[0].y };
    } else if (pts.length >= 2) {
      const [a, b] = pts;
      gesture = {
        kind: 'pinch',
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        fov: viewer.fovValue,
      };
    }
  }

  function rotateBy(dx, dy, dt) {
    const k = degPerPx();
    const dYaw = -dx * k;
    const dPitch = dy * k;
    viewer.setView({ yaw: viewer.yaw + dYaw, pitch: viewer.pitch + dPitch });
    if (dt > 0) {
      // 최근 움직임 위주로 속도를 추정(도/ms)
      velocity.yaw = velocity.yaw * 0.6 + (dYaw / dt) * 0.4;
      velocity.pitch = velocity.pitch * 0.6 + (dPitch / dt) * 0.4;
    }
  }

  el.addEventListener('pointerdown', (e) => {
    if (!state.enabled) return;
    if (e.pointerType === 'touch' && !state.singleFinger && pointers.size === 0) {
      // 주석 모드: 첫 손가락은 그리기 쪽이 처리. 두 번째 손가락부터 둘러보기
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, passive: true });
      return;
    }
    el.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastMove = performance.now();
    startGesture();
  });

  el.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p || !state.enabled) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!gesture) return;
    const now = performance.now();
    const dt = now - lastMove;
    lastMove = now;

    if (gesture.kind === 'drag' && pointers.size === 1) {
      rotateBy(p.x - gesture.x, p.y - gesture.y, dt);
      gesture.x = p.x;
      gesture.y = p.y;
    } else if (gesture.kind === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      viewer.setView({ fov: (gesture.fov * gesture.dist) / dist });
      rotateBy(mid.x - gesture.mid.x, mid.y - gesture.mid.y, 0);
      gesture.mid = mid;
    }
    changed();
  });

  const end = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size === 0) {
      gesture = null;
      // 손을 뗄 때 이미 멈춰 있었다면 관성 없음
      if (performance.now() - lastMove > 80) velocity = { yaw: 0, pitch: 0 };
    } else {
      startGesture(); // 손가락 수가 바뀌면 기준점 재설정
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  el.addEventListener(
    'wheel',
    (e) => {
      if (!state.enabled) return;
      e.preventDefault();
      viewer.setView({ fov: viewer.fovValue * Math.exp(e.deltaY * 0.001) });
      changed();
    },
    { passive: false },
  );

  // 사파리의 화면 확대 제스처 막기
  for (const type of ['gesturestart', 'gesturechange']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }

  viewer.onFrame((dt) => {
    if (gesture || (!velocity.yaw && !velocity.pitch)) return;
    viewer.setView({ yaw: viewer.yaw + velocity.yaw * dt, pitch: viewer.pitch + velocity.pitch * dt });
    const decay = Math.exp(-dt / FRICTION_MS);
    velocity.yaw *= decay;
    velocity.pitch *= decay;
    if (Math.abs(velocity.yaw) + Math.abs(velocity.pitch) < 0.0005) velocity = { yaw: 0, pitch: 0 };
    changed();
  });

  return state;
}
