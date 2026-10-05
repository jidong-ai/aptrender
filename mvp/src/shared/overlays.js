// 파노라마 위에 겹치는 표시. 두 화면 공용
//  - createSphereLines: 구면 위 선(주석 stroke, 따라 그릴 점선 체크, 치수선). 방향 좌표라 두 화면의 같은 벽에 붙는다
//  - createAnchors: 방향(yaw·pitch)에 붙는 DOM 요소(핫스팟, 라벨). 시야 밖이면 가장자리 화살표로 바꿀 수 있다
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { dirFromYawPitch, wrapYaw } from './angles.js';

const RADIUS = 440; // 파노라마 구(500)보다 안쪽, 매니저 시선 테두리(450)보다 안쪽

function toPositions(pts) {
  const out = [];
  for (const [yaw, pitch] of pts) {
    const [x, y, z] = dirFromYawPitch(yaw, pitch);
    out.push(x * RADIUS, y * RADIUS, z * RADIUS);
  }
  if (out.length === 3) out.push(out[0] + 0.01, out[1], out[2]); // 점 하나도 보이게
  return out;
}

/** a → b 사이를 n등분한 방향 목록(yaw 이음매 고려) */
export function interpolate(a, b, n = 24) {
  const dy = wrapYaw(b.yaw - a.yaw);
  return Array.from({ length: n + 1 }, (_, i) => [a.yaw + (dy * i) / n, a.pitch + ((b.pitch - a.pitch) * i) / n]);
}

export function createSphereLines(viewer, { scale = 1 } = {}) {
  const materials = new Set();
  const size = new THREE.Vector2(1, 1);
  viewer.onResize((w, h) => {
    size.set(w, h);
    for (const m of materials) m.resolution.copy(size);
  });

  function material(opts) {
    const m = new LineMaterial({ transparent: true, depthTest: false, depthWrite: false, ...opts });
    m.resolution.copy(size);
    materials.add(m);
    return m;
  }

  // 선 하나 = 어두운 테두리(halo) + 색 선. 흰 벽 위에서도 보이게
  function makeLine({ color, width, dashed = false, order = 120 }) {
    let geometry = new LineGeometry();
    const halo = material({ color: 0x000000, linewidth: (width + 3) * scale, opacity: 0.28 });
    const core = material({ color, linewidth: width * scale, opacity: 1, dashed, dashSize: 1.6, gapSize: 1.2 });
    const meshes = [new Line2(geometry, halo), new Line2(geometry, core)];
    meshes.forEach((m, i) => {
      m.renderOrder = order + i;
      m.frustumCulled = false;
      viewer.scene.add(m);
    });
    return {
      set(pts) {
        if (!pts.length) {
          meshes.forEach((m) => (m.visible = false));
          return;
        }
        // 점 수가 바뀌면 지오메트리를 새로 만든다(Line2는 처음 그린 인스턴스 수를 기억해서 늘어난 점을 안 그림)
        const next = new LineGeometry();
        next.setPositions(toPositions(pts));
        meshes.forEach((m) => (m.geometry = next));
        geometry.dispose();
        geometry = next;
        if (dashed) meshes[1].computeLineDistances();
        meshes.forEach((m) => (m.visible = pts.length > 0));
      },
      set visible(v) {
        meshes.forEach((m) => (m.visible = v));
      },
      dispose() {
        meshes.forEach((m) => viewer.scene.remove(m));
        geometry.dispose();
        materials.delete(halo);
        materials.delete(core);
        halo.dispose();
        core.dispose();
      },
    };
  }

  const strokes = new Map(); // id -> { line, n }
  const template = makeLine({ color: 0x1aa0ff, width: 5, dashed: true, order: 110 });
  template.visible = false;
  const dims = [makeLine({ color: 0xffffff, width: 3, order: 112 }), makeLine({ color: 0xffffff, width: 3, order: 112 }), makeLine({ color: 0xffffff, width: 3, order: 112 })];
  dims.forEach((d) => (d.visible = false));

  return {
    /** 서버 상태의 strokes 중 이 공간(pano)에 그린 것만 그린다. 바뀐 것만 다시 만든다 */
    setStrokes(list, pano) {
      const wanted = new Set();
      for (const s of list) {
        if (s.pano !== pano || s.pts.length === 0) continue;
        wanted.add(s.id);
        let entry = strokes.get(s.id);
        if (!entry) {
          const color = new THREE.Color(s.color).getHex();
          entry = { line: makeLine({ color, width: s.width * 2, order: 130 }), n: 0 };
          strokes.set(s.id, entry);
        }
        if (entry.n !== s.pts.length) {
          entry.line.set(s.pts);
          entry.n = s.pts.length;
        }
      }
      for (const [id, entry] of strokes) {
        if (wanted.has(id)) continue;
        entry.line.dispose();
        strokes.delete(id);
      }
    },
    /** 따라 그릴 점선 체크. pts = [[yaw, pitch], ...] 또는 null */
    setTemplate(pts) {
      if (!pts) {
        template.visible = false;
        return;
      }
      const dense = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const seg = interpolate({ yaw: pts[i][0], pitch: pts[i][1] }, { yaw: pts[i + 1][0], pitch: pts[i + 1][1] }, 12);
        dense.push(...(i ? seg.slice(1) : seg));
      }
      template.set(dense);
    },
    /** 치수선(양 끝 눈금 포함). dim = { from, to } 또는 null */
    setDimension(dim) {
      if (!dim) {
        dims.forEach((d) => (d.visible = false));
        return;
      }
      const { from, to } = dim;
      dims[0].set(interpolate(from, to));
      dims[1].set([[from.yaw, from.pitch + 1.6], [from.yaw, from.pitch - 1.6]]);
      dims[2].set([[to.yaw, to.pitch + 1.6], [to.yaw, to.pitch - 1.6]]);
    },
  };
}

/**
 * 방향에 붙는 DOM 요소들. layer = 화면 전체를 덮는 position:fixed 요소(pointer-events는 요소별로)
 *  add(el, { yaw, pitch }, { edge })  edge: 시야 밖일 때 화면 가장자리에 붙이고 방향을 data-angle로 알려준다
 */
export function createAnchors(viewer, layer, { margin = 64 } = {}) {
  const items = new Set();
  viewer.onFrame(() => {
    if (!items.size) return;
    viewer.applyCamera();
    const w = viewer.container.clientWidth;
    const h = viewer.container.clientHeight;
    for (const it of items) {
      if (!it.pos || it.hidden) {
        it.el.hidden = true;
        continue;
      }
      const p = viewer.project(it.pos.yaw, it.pos.pitch);
      const inside = !p.behind && p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
      it.screen = inside ? { x: p.x, y: p.y } : null;
      if (inside) {
        it.el.hidden = false;
        it.el.classList.remove('is-edge');
        it.el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        continue;
      }
      if (!it.edge) {
        it.el.hidden = true;
        continue;
      }
      // 시야 밖: 중심 방향으로 화면 가장자리
      let dx = p.cam.x;
      let dy = -p.cam.y;
      if (Math.hypot(dx, dy) < 1e-3) dx = wrapYaw(it.pos.yaw - viewer.yaw) >= 0 ? 1 : -1;
      const ang = Math.atan2(dy, dx);
      const hw = w / 2 - margin;
      const hh = h / 2 - margin;
      const s = Math.min(hw / Math.abs(Math.cos(ang) || 1e-6), hh / Math.abs(Math.sin(ang) || 1e-6));
      it.el.hidden = false;
      it.el.classList.add('is-edge');
      it.el.style.setProperty('--angle', `${ang}rad`);
      it.el.style.transform = `translate(${w / 2 + Math.cos(ang) * s}px, ${h / 2 + Math.sin(ang) * s}px)`;
    }
  });
  return {
    add(el, pos, { edge = false } = {}) {
      el.classList.add('anchor');
      el.hidden = true;
      layer.append(el);
      const it = { el, pos, edge, hidden: false, screen: null };
      items.add(it);
      return {
        el,
        get screen() {
          return it.screen;
        },
        set(next) {
          it.pos = next;
        },
        show(on) {
          it.hidden = !on;
          if (!on) el.hidden = true;
        },
        remove() {
          items.delete(it);
          el.remove();
        },
      };
    },
  };
}
