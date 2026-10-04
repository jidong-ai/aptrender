import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { dirFromYawPitch, wrapYaw } from '../shared/angles.js';

const RAD = Math.PI / 180;
const RADIUS = 450; // 파노라마 구(500)보다 안쪽
const SAMPLES = 16; // 한 변을 몇 점으로 나눠 구면 곡선으로 그릴지
const SMOOTH_MS = 90; // 10Hz로 오는 시점을 부드럽게 따라가는 정도
const EDGE_MARGIN = 72;

const ARROW_SVG =
  '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><path d="M4 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * XR 화면에 "매니저가 보는 곳"을 표시한다.
 *  - 태블릿 화면 영역(yaw·pitch·fov·aspect)을 구면 위 사각형 테두리로 그린다
 *  - 그 영역이 XR 시야 밖이면 가장자리에 방향 화살표를 띄운다
 */
export function createManagerFrame(viewer, layer) {
  const geometry = new LineGeometry();
  // 흰 벽 위에서도 보이도록 어두운 테두리(halo) 위에 흰 선을 겹친다
  const halo = new LineMaterial({ color: 0x000000, linewidth: 7, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false });
  const core = new LineMaterial({ color: 0xffffff, linewidth: 3, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const lines = [new Line2(geometry, halo), new Line2(geometry, core)];
  lines.forEach((line, i) => {
    line.renderOrder = 3 + i;
    line.frustumCulled = false;
    line.visible = false;
    viewer.scene.add(line);
  });
  viewer.onResize((w, h) => {
    halo.resolution.set(w, h);
    core.resolution.set(w, h);
  });

  const label = Object.assign(document.createElement('div'), { className: 'mgr-label', textContent: '매니저가 보는 곳' });
  const arrow = Object.assign(document.createElement('div'), { className: 'mgr-arrow' });
  arrow.innerHTML = `<span class="mgr-arrow-glyph">${ARROW_SVG}</span><span class="mgr-arrow-text">매니저 시선</span>`;
  const glyph = arrow.firstElementChild;
  layer.append(label, arrow);

  const tabletCam = new THREE.PerspectiveCamera(); // 카메라 lookAt은 -z가 대상을 향함(일반 Object3D와 반대)
  const v = new THREE.Vector3();
  let target = null;
  let shown = null;
  let visible = false;
  let lastKey = '';

  function orient(view) {
    tabletCam.position.set(0, 0, 0);
    tabletCam.lookAt(...dirFromYawPitch(view.yaw, view.pitch));
    tabletCam.updateMatrixWorld();
  }

  // 태블릿 카메라 기준 (x, y, -1) 방향 → 월드 좌표
  const toWorld = (x, y) => v.set(x, y, -1).normalize().applyQuaternion(tabletCam.quaternion).multiplyScalar(RADIUS);

  function updateOutline(view) {
    const ty = Math.tan((view.fov * RAD) / 2);
    const tx = ty * view.aspect;
    const corners = [[-tx, ty], [tx, ty], [tx, -ty], [-tx, -ty]];
    const pts = [];
    for (let e = 0; e < 4; e++) {
      const [x0, y0] = corners[e];
      const [x1, y1] = corners[(e + 1) % 4];
      for (let i = 0; i < SAMPLES; i++) {
        const t = i / SAMPLES;
        toWorld(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
        pts.push(v.x, v.y, v.z);
      }
    }
    pts.push(pts[0], pts[1], pts[2]);
    geometry.setPositions(pts);
    return ty;
  }

  function screenOf(world) {
    const cam = world.clone().applyMatrix4(viewer.camera.matrixWorldInverse);
    const ndc = world.clone().project(viewer.camera);
    const w = viewer.container.clientWidth;
    const h = viewer.container.clientHeight;
    return { x: (ndc.x * 0.5 + 0.5) * w, y: (-ndc.y * 0.5 + 0.5) * h, behind: cam.z > 0, cam, w, h };
  }

  viewer.onFrame((dt) => {
    const on = visible && target;
    lines.forEach((l) => (l.visible = Boolean(on)));
    if (!on) {
      label.hidden = arrow.hidden = true;
      return;
    }
    if (!shown) shown = { ...target };
    const k = 1 - Math.exp(-dt / SMOOTH_MS);
    shown.yaw = wrapYaw(shown.yaw + wrapYaw(target.yaw - shown.yaw) * k);
    shown.pitch += (target.pitch - shown.pitch) * k;
    shown.fov += (target.fov - shown.fov) * k;
    shown.aspect += (target.aspect - shown.aspect) * k;

    orient(shown);
    const key = `${shown.yaw.toFixed(2)}|${shown.pitch.toFixed(2)}|${shown.fov.toFixed(2)}|${shown.aspect.toFixed(3)}`;
    const ty = Math.tan((shown.fov * RAD) / 2);
    if (key !== lastKey) {
      updateOutline(shown);
      lastKey = key;
    }

    viewer.applyCamera(); // 흔들림까지 반영된 현재 XR 카메라 기준으로 계산
    const center = screenOf(toWorld(0, 0).clone());
    const onScreen = !center.behind && center.x >= 0 && center.x <= center.w && center.y >= 0 && center.y <= center.h;

    if (onScreen) {
      // 라벨: 테두리 윗변 가운데, 화면 밖으로 나가면 안쪽으로 붙인다
      const top = screenOf(toWorld(0, ty).clone());
      const x = Math.min(center.w - EDGE_MARGIN, Math.max(EDGE_MARGIN, top.behind ? center.x : top.x));
      const y = Math.min(center.h - EDGE_MARGIN, Math.max(EDGE_MARGIN, top.behind ? EDGE_MARGIN : top.y));
      label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -130%)`;
      label.hidden = false;
      arrow.hidden = true;
      return;
    }

    // 화면 밖: 중심 방향으로 가장자리 화살표
    let dx = center.cam.x;
    let dy = -center.cam.y;
    if (Math.hypot(dx, dy) < 1e-3) dx = wrapYaw(shown.yaw - viewer.yaw) >= 0 ? 1 : -1;
    const ang = Math.atan2(dy, dx);
    const hw = center.w / 2 - EDGE_MARGIN;
    const hh = center.h / 2 - EDGE_MARGIN;
    const s = Math.min(hw / Math.abs(Math.cos(ang) || 1e-6), hh / Math.abs(Math.sin(ang) || 1e-6));
    const x = center.w / 2 + Math.cos(ang) * s;
    const y = center.h / 2 + Math.sin(ang) * s;
    arrow.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    glyph.style.transform = `rotate(${ang}rad)`;
    arrow.hidden = false;
    label.hidden = true;
  });

  return {
    setTarget(view) {
      target = { ...view };
    },
    setVisible(on) {
      visible = on;
      if (!on) shown = null;
    },
  };
}
