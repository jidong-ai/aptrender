import * as THREE from 'three';
import { clamp, dirFromYawPitch, vFovFromH, wrapYaw, yawPitchFromDir } from './angles.js';

const RADIUS = 500;
const FADE_MS = 800;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const clamp01 = (t) => Math.min(1, Math.max(0, t));

export const LAYER_SLOTS = ['floor', 'island']; // 아래에서 위 순서로 겹친다(바닥재 누끼는 아일랜드 없이 렌더)
const DROP = 1.2 / 180; // 배치 연출: 오브제가 1.2°만큼 위에서 내려앉는다(구 uv 단위)
const EFFECT_MS = { place: 1100, paint: 1300, remove: 450, swap: 350 };

// 오려낸 레이어용 셰이더: 잘라낸 사각형(crop)만 구 위 제자리에 붙이고, 연출용 값을 받는다
//  - reveal: 구 아래(발밑)부터 이 높이(uv.y)까지만 보인다 → 바닥재가 발밑에서 퍼지는 연출
//  - glow:   흰빛을 섞는다 → 놓일 자리가 반투명하게 빛나는 연출
const LAYER_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const LAYER_FRAG = /* glsl */ `
uniform sampler2D map;
uniform mat3 crop;
uniform float opacity;
uniform float reveal;
uniform float glow;
varying vec2 vUv;
void main() {
  vec2 t = (crop * vec3(vUv, 1.0)).xy;
  if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0) discard;
  vec4 c = texture2D(map, t);
  float shown = 1.0 - smoothstep(reveal - 0.06, reveal, vUv.y);
  c.rgb = mix(c.rgb, vec3(1.0), glow);
  gl_FragColor = vec4(c.rgb, c.a * opacity * shown);
  #include <colorspace_fragment>
}`;

/**
 * 360° 파노라마 뷰어. 카메라는 구 중심에 고정되고 yaw/pitch/fov만 바뀐다.
 *  - fov: { v: 75 } 세로 시야각 고정(태블릿) / { h: 90 } 가로 시야각 고정(XR)
 *  - 장면 = 배경 파노라마 1장 + 오려낸 레이어(아일랜드·바닥재). 배경은 고정하고 레이어만 바꿀 수 있다
 *  - showStack(scene): 장면 전체 교체(시점 이동). 0.8초 크로스페이드
 *  - setLayer(slot, layer, { effect }): 같은 공간에서 레이어만 교체(오브제 배치·자재 변경)
 *  - offset: 화면 흔들림처럼 시점에 더해지는 값(공유되는 시점에는 포함되지 않음)
 */
export class PanoViewer {
  constructor(container, { fov = { v: 75 }, fovRange = [30, 100], maxPixelRatio = 2 } = {}) {
    this.container = container;
    this.yaw = 0;
    this.pitch = 0;
    this.fovMode = fov.h ? 'h' : 'v';
    this.fovValue = fov.h ?? fov.v;
    this.fovRange = fovRange;
    this.offset = { yaw: 0, pitch: 0 };
    this.frameHandlers = new Set();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.append(this.renderer.domElement);
    this.maxTextureSize = this.renderer.capabilities.maxTextureSize;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, RADIUS * 2);

    // 구 안쪽에 이미지를 붙인다. 이미지 가로 중앙(u=0.5)이 yaw 0°(-z)를 향하도록 회전
    this.geometry = new THREE.SphereGeometry(RADIUS, 96, 48);
    this.geometry.scale(-1, 1, 1);

    // 장면 묶음 2개를 번갈아 쓴다(시점 이동 때 새 묶음을 위에 겹쳐 크로스페이드)
    this.stacks = [this.makeStack(), this.makeStack()];
    this.front = this.stacks[0];
    this.fade = null;
    this.overlay = this.makeMesh(new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    this.overlay.renderOrder = 50; // 방위 격자 겹쳐 보기용

    this.resize = this.resize.bind(this);
    new ResizeObserver(this.resize).observe(container);
    this.resize();

    let last = performance.now();
    this.renderer.setAnimationLoop((now) => {
      const dt = Math.min(100, now - last);
      last = now;
      this.tick(now);
      for (const fn of this.frameHandlers) fn(dt, now);
      this.applyCamera();
      this.renderer.render(this.scene, this.camera);
    });
  }

  makeMesh(material) {
    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.rotation.y = -Math.PI / 2;
    mesh.visible = false;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return mesh;
  }

  makeStack() {
    const base = this.makeMesh(new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    const layers = {};
    for (const slot of LAYER_SLOTS) {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: null },
          crop: { value: new THREE.Matrix3() },
          opacity: { value: 1 },
          reveal: { value: 2 },
          glow: { value: 0 },
        },
        vertexShader: LAYER_VERT,
        fragmentShader: LAYER_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      layers[slot] = { mesh: this.makeMesh(material), layer: null, opacity: 1, reveal: 2, glow: 0, drop: 0, anim: null };
    }
    return { base, layers, alpha: 0 };
  }

  setStackOrder(stack, order) {
    stack.base.renderOrder = order;
    LAYER_SLOTS.forEach((slot, i) => (stack.layers[slot].mesh.renderOrder = order + 0.1 * (i + 1)));
  }

  get vFov() {
    return this.fovMode === 'v' ? this.fovValue : vFovFromH(this.fovValue, this.camera.aspect);
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.applyCamera();
    for (const fn of this.resizeHandlers ?? []) fn(w, h);
  }

  onResize(fn) {
    (this.resizeHandlers ??= new Set()).add(fn);
    fn(this.container.clientWidth || 1, this.container.clientHeight || 1);
  }

  onFrame(fn) {
    this.frameHandlers.add(fn);
    return () => this.frameHandlers.delete(fn);
  }

  applyCamera() {
    this.camera.fov = this.vFov;
    this.camera.updateProjectionMatrix();
    const [x, y, z] = dirFromYawPitch(this.yaw + this.offset.yaw, clamp(this.pitch + this.offset.pitch, -89, 89));
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(x, y, z);
    this.camera.updateMatrixWorld();
  }

  setView({ yaw = this.yaw, pitch = this.pitch, fov }) {
    this.yaw = wrapYaw(yaw);
    this.pitch = clamp(pitch, -85, 85);
    if (fov !== undefined) this.fovValue = clamp(fov, ...this.fovRange);
  }

  /** 공유용 시점. fov는 항상 세로 시야각 */
  getView() {
    return { yaw: this.yaw, pitch: this.pitch, fov: this.vFov, aspect: this.camera.aspect };
  }

  // ---------- 텍스처 ----------

  prepareTexture(texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false; // 파노라마는 거의 확대만 하므로 밉맵 메모리를 아낀다
    this.renderer.initTexture(texture); // 미리 GPU에 올려 첫 전환 때 끊김 방지
    return texture;
  }

  /** 이미지 URL → 텍스처. maxWidth보다 크면 비율을 지켜 줄여서 올린다(아이패드 메모리 보호) */
  async loadTexture(url, maxWidth = this.maxTextureSize) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const limit = Math.min(maxWidth, this.maxTextureSize);
    if (img.naturalWidth <= limit && img.naturalHeight <= this.maxTextureSize) {
      const texture = new THREE.Texture(img);
      texture.needsUpdate = true;
      return this.prepareTexture(texture);
    }
    const canvas = document.createElement('canvas');
    canvas.width = limit;
    canvas.height = Math.round((limit * img.naturalHeight) / img.naturalWidth);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return this.prepareTexture(new THREE.CanvasTexture(canvas));
  }

  canvasTexture(canvas) {
    return this.prepareTexture(new THREE.CanvasTexture(canvas));
  }

  // ---------- 장면 ----------

  /**
   * 장면 전체 교체(시점 이동 등). scene = { base: Texture, island?: Layer, floor?: Layer }
   * Layer = { texture, rect: [x0, y0, x1, y1] } (이미지 기준 0~1, 왼쪽 위가 0)
   */
  showStack(scene, { fadeMs = FADE_MS } = {}) {
    this.finishFade();
    const first = !this.front.base.visible;
    const target = first ? this.front : this.stacks.find((s) => s !== this.front);
    this.fillStack(target, scene);
    if (first || fadeMs === 0) {
      if (target !== this.front) this.clearStack(this.front);
      this.front = target;
      target.alpha = 1;
      this.setStackOrder(target, 0);
      return;
    }
    this.setStackOrder(this.front, 0);
    this.setStackOrder(target, 1);
    target.alpha = 0;
    this.fade = { start: performance.now(), duration: fadeMs, to: target };
  }

  /** 예전 방식 호환: 배경 한 장만 교체 */
  show(texture, options) {
    this.showStack({ base: texture }, options);
  }

  fillStack(stack, scene) {
    stack.base.material.map = scene.base ?? null;
    stack.base.material.needsUpdate = true;
    for (const slot of LAYER_SLOTS) {
      Object.assign(stack.layers[slot], { opacity: 1, reveal: 2, glow: 0, drop: 0, anim: null });
      this.assignLayer(stack.layers[slot], scene[slot] ?? null);
    }
  }

  clearStack(stack) {
    stack.alpha = 0;
    stack.base.material.map = null;
    for (const slot of LAYER_SLOTS) this.assignLayer(stack.layers[slot], null);
  }

  assignLayer(L, layer) {
    L.layer = layer;
    L.mesh.material.uniforms.map.value = layer?.texture ?? null;
  }

  /**
   * 같은 공간에서 레이어 하나만 바꾼다.
   *  effect: 'place'(빛나며 내려앉기) | 'paint'(발밑에서 퍼지기) | 'swap'(살짝 페이드) | 'none'
   *  layer가 null이면 서서히 치운다. delay(ms) 뒤에 연출 시작
   */
  setLayer(slot, layer, { effect = 'swap', delay = 0 } = {}) {
    this.finishFade();
    const L = this.front.layers[slot];
    if (!layer) {
      if (!L.layer) return;
      L.anim = { kind: 'remove', start: performance.now(), from: L.opacity };
      return;
    }
    if (L.layer === layer && !L.anim) return;
    this.assignLayer(L, layer);
    if (effect === 'none') {
      Object.assign(L, { opacity: 1, reveal: 2, glow: 0, drop: 0, anim: null });
      return;
    }
    Object.assign(L, { opacity: 0, reveal: effect === 'paint' ? 0 : 2, glow: 0, drop: 0 });
    L.anim = { kind: effect, start: performance.now() + delay };
  }

  tick(now) {
    if (this.fade) {
      const t = Math.min(1, (now - this.fade.start) / this.fade.duration);
      this.fade.to.alpha = ease(t);
      if (t >= 1) this.finishFade();
    }
    for (const stack of this.stacks) {
      for (const slot of LAYER_SLOTS) this.tickLayer(stack.layers[slot], now);
      this.applyStack(stack);
    }
  }

  tickLayer(L, now) {
    const a = L.anim;
    if (!a) return;
    const t = clamp01((now - a.start) / EFFECT_MS[a.kind]);
    if (now < a.start) return;
    if (a.kind === 'place') {
      // 0~35%: 놓일 자리가 반투명하게 빛남 → 30~100%: 실제 오브제로 채워지며 내려앉음
      const p1 = easeOut(clamp01(t / 0.35));
      const p2 = ease(clamp01((t - 0.3) / 0.7));
      L.opacity = Math.max(0.5 * p1, p2);
      L.glow = 0.75 * (1 - p2);
      L.drop = DROP * (1 - easeOut(clamp01((t - 0.3) / 0.7)));
    } else if (a.kind === 'paint') {
      // 발밑(구 아래쪽)에서 수평선까지 새 바닥재가 번져 나간다
      L.opacity = 1;
      L.reveal = -0.06 + easeOut(t) * 0.62;
      L.glow = 0.18 * (1 - t);
    } else if (a.kind === 'swap') {
      L.opacity = ease(t);
    } else if (a.kind === 'remove') {
      L.opacity = (a.from ?? 1) * (1 - ease(t));
    }
    if (t >= 1) {
      if (a.kind === 'remove') this.assignLayer(L, null);
      Object.assign(L, { opacity: 1, reveal: 2, glow: 0, drop: 0, anim: null });
    }
  }

  applyStack(stack) {
    const base = stack.base;
    base.material.opacity = stack.alpha;
    base.visible = Boolean(base.material.map) && stack.alpha > 0;
    for (const slot of LAYER_SLOTS) {
      const L = stack.layers[slot];
      const u = L.mesh.material.uniforms;
      const opacity = stack.alpha * L.opacity;
      L.mesh.visible = Boolean(L.layer) && opacity > 0.001;
      if (!L.mesh.visible) continue;
      u.opacity.value = opacity;
      u.reveal.value = L.reveal;
      u.glow.value = L.glow;
      // vUv(구 전체 0~1) → 잘라낸 이미지 좌표. 텍스처는 위쪽이 uv.y=1
      const [x0, y0, x1, y1] = L.layer.rect;
      const sx = 1 / (x1 - x0);
      const sy = 1 / (y1 - y0);
      u.crop.value.set(sx, 0, -x0 * sx, 0, sy, -(1 - y1 + L.drop) * sy, 0, 0, 1);
    }
  }

  finishFade() {
    if (!this.fade) return;
    const { to } = this.fade;
    this.fade = null;
    const old = this.front;
    to.alpha = 1;
    this.front = to;
    if (old !== to) this.clearStack(old);
    this.setStackOrder(to, 0);
  }

  setOverlay(texture) {
    this.overlay.material.map = texture ?? null;
    this.overlay.material.needsUpdate = true;
    this.overlay.visible = Boolean(texture);
  }

  /**
   * 돌리 전환: 대상 방향으로 고개를 돌리며 살짝 확대한다(공간 이동 직전 연출). 끝나면 resolve.
   * 이어서 showStack으로 다음 공간을 띄우고 resetZoom()으로 시야각을 되돌린다
   */
  dolly({ yaw, pitch }, ms = 650) {
    const from = { yaw: this.yaw, pitch: this.pitch, fov: this.fovValue };
    const to = { yaw: from.yaw + wrapYaw(yaw - from.yaw), pitch: Math.max(-20, pitch * 0.4), fov: from.fov * 0.72 };
    this.zoomBack = from.fov;
    const start = performance.now();
    return new Promise((resolve) => {
      const off = this.onFrame((dt, now) => {
        const t = clamp01((now - start) / ms);
        const e = ease(t);
        this.yaw = wrapYaw(from.yaw + (to.yaw - from.yaw) * e);
        this.pitch = from.pitch + (to.pitch - from.pitch) * e;
        this.fovValue = from.fov + (to.fov - from.fov) * e;
        if (t >= 1) {
          off();
          resolve();
        }
      });
    });
  }

  resetZoom(ms = 700) {
    if (this.zoomBack === undefined) return;
    const from = this.fovValue;
    const to = this.zoomBack;
    this.zoomBack = undefined;
    if (ms <= 0) {
      this.fovValue = to;
      return;
    }
    const start = performance.now();
    const off = this.onFrame((dt, now) => {
      const t = clamp01((now - start) / ms);
      this.fovValue = from + (to - from) * easeOut(t);
      if (t >= 1) off();
    });
  }

  // ---------- 화면 좌표 ----------

  /** 화면 좌표(CSS px, 캔버스 기준) → 방향 */
  unproject(x, y) {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const v = new THREE.Vector3((x / w) * 2 - 1, -(y / h) * 2 + 1, 0.5).unproject(this.camera);
    return yawPitchFromDir(v.x, v.y, v.z);
  }

  /** 방향 → 화면 좌표(CSS px). behind = 카메라 뒤쪽 */
  project(yaw, pitch) {
    const v = new THREE.Vector3(...dirFromYawPitch(yaw, pitch));
    const cam = v.clone().applyMatrix4(this.camera.matrixWorldInverse);
    v.project(this.camera);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    return {
      x: (v.x * 0.5 + 0.5) * w,
      y: (-v.y * 0.5 + 0.5) * h,
      behind: cam.z > 0,
      cam, // 카메라 기준 좌표(화면 밖 화살표 방향 계산용)
    };
  }
}
