import * as THREE from 'three';
import { clamp, dirFromYawPitch, vFovFromH, wrapYaw } from './angles.js';

const RADIUS = 500;
const FADE_MS = 800;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * 360° 파노라마 뷰어. 카메라는 구 중심에 고정되고 yaw/pitch/fov만 바뀐다.
 *  - fov: { v: 75 } 세로 시야각 고정(태블릿) / { h: 90 } 가로 시야각 고정(XR)
 *  - show(texture): 0.8초 크로스페이드로 교체
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
    const geometry = new THREE.SphereGeometry(RADIUS, 96, 48);
    geometry.scale(-1, 1, 1);
    const makeLayer = (order) => {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthTest: false, depthWrite: false }),
      );
      mesh.rotation.y = -Math.PI / 2;
      mesh.renderOrder = order;
      mesh.visible = false;
      this.scene.add(mesh);
      return mesh;
    };
    this.base = makeLayer(0);
    this.incoming = makeLayer(1);
    this.overlay = makeLayer(2); // 방위 격자 겹쳐 보기용
    this.fade = null;

    this.resize = this.resize.bind(this);
    new ResizeObserver(this.resize).observe(container);
    this.resize();

    let last = performance.now();
    this.renderer.setAnimationLoop((now) => {
      const dt = Math.min(100, now - last);
      last = now;
      this.tickFade(now);
      for (const fn of this.frameHandlers) fn(dt, now);
      this.applyCamera();
      this.renderer.render(this.scene, this.camera);
    });
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
    texture.generateMipmaps = false; // 파노라마는 거의 확대만 하므로 밉맵 메모리를 아낀다
    this.renderer.initTexture(texture); // 미리 GPU에 올려 첫 전환 때 끊김 방지
    return texture;
  }

  /** 이미지 URL → 텍스처. maxWidth보다 크면 줄여서 올린다(아이패드 메모리 보호) */
  async loadTexture(url, maxWidth = this.maxTextureSize) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const limit = Math.min(maxWidth, this.maxTextureSize);
    if (img.naturalWidth <= limit) return this.markLoaded(img);
    const canvas = document.createElement('canvas');
    canvas.width = limit;
    canvas.height = limit / 2;
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return this.prepareTexture(new THREE.CanvasTexture(canvas));
  }

  markLoaded(img) {
    const texture = new THREE.Texture(img);
    texture.needsUpdate = true;
    return this.prepareTexture(texture);
  }

  canvasTexture(canvas) {
    return this.prepareTexture(new THREE.CanvasTexture(canvas));
  }

  /** 파노라마 교체. 첫 장은 바로, 이후는 크로스페이드 */
  show(texture, { fadeMs = FADE_MS } = {}) {
    if (this.base.material.map === texture && !this.fade) return;
    if (!this.base.visible || fadeMs === 0) {
      this.finishFade();
      this.setLayer(this.base, texture, 1);
      return;
    }
    this.finishFade();
    this.setLayer(this.incoming, texture, 0);
    this.fade = { start: performance.now(), duration: fadeMs };
  }

  setLayer(mesh, texture, opacity) {
    mesh.material.map = texture;
    mesh.material.opacity = opacity;
    mesh.material.needsUpdate = true;
    mesh.visible = true;
  }

  tickFade(now) {
    if (!this.fade) return;
    const t = Math.min(1, (now - this.fade.start) / this.fade.duration);
    this.incoming.material.opacity = ease(t);
    if (t >= 1) this.finishFade();
  }

  finishFade() {
    if (!this.fade) return;
    this.fade = null;
    this.setLayer(this.base, this.incoming.material.map, 1);
    this.incoming.visible = false;
  }

  setOverlay(texture) {
    if (texture) this.setLayer(this.overlay, texture, 1);
    else this.overlay.visible = false;
  }

  // ---------- 화면 좌표 ----------

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
