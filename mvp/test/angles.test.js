import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirFromYawPitch, uvFromYawPitch, yawPitchFromDir, hFovFromV, vFovFromH, wrapYaw } from '../src/shared/angles.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('yaw 0 = -z(정면), +90 = +x(오른쪽), pitch +90 = 위', () => {
  const [x0, y0, z0] = dirFromYawPitch(0, 0);
  close(x0, 0); close(y0, 0); close(z0, -1);
  const [x1, , z1] = dirFromYawPitch(90, 0);
  close(x1, 1); close(z1, 0);
  close(dirFromYawPitch(0, 90)[1], 1);
});

test('방향 ↔ yaw/pitch 왕복 변환', () => {
  for (const [yaw, pitch] of [[0, 0], [45, 10], [-120, -30], [179, 60], [-179, -80]]) {
    const r = yawPitchFromDir(...dirFromYawPitch(yaw, pitch));
    close(r.yaw, yaw, 1e-6);
    close(r.pitch, pitch, 1e-6);
  }
});

test('이미지 좌표: 정면은 가로 중앙, 오른쪽 90°는 3/4 지점', () => {
  assert.deepEqual(uvFromYawPitch(0, 0), { u: 0.5, v: 0.5 });
  assert.deepEqual(uvFromYawPitch(90, 45), { u: 0.75, v: 0.25 });
  close(wrapYaw(270), -90);
});

test('가로·세로 시야각 변환', () => {
  close(vFovFromH(hFovFromV(60, 16 / 9), 16 / 9), 60, 1e-9);
  close(hFovFromV(90, 1), 90, 1e-9);
});
