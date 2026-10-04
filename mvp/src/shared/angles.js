// 방향 좌표 규칙 (모든 화면 공통, 단위: 도)
//  - yaw 0°   = 파노라마 이미지 가로 중앙. +면 오른쪽으로 돈다. 범위 -180~180
//  - pitch 0° = 수평선. +면 위. 범위 -90~90
//  - 3D 좌표: y가 위, yaw 0°가 -z, yaw +90°가 +x (three.js 기본 카메라와 같은 방향)
// 이미지 픽셀과의 관계: u = 0.5 + yaw/360, v = 0.5 - pitch/180 (u·v는 0~1, 왼쪽 위가 0)

const RAD = Math.PI / 180;

export const wrapYaw = (yaw) => ((((yaw + 180) % 360) + 360) % 360) - 180;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** yaw/pitch → 단위 방향 벡터 [x, y, z] */
export function dirFromYawPitch(yaw, pitch) {
  const y = yaw * RAD;
  const p = pitch * RAD;
  return [Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
}

/** 방향 벡터 → { yaw, pitch } (길이는 상관없음) */
export function yawPitchFromDir(x, y, z) {
  const len = Math.hypot(x, y, z) || 1;
  return {
    yaw: Math.atan2(x, -z) / RAD,
    pitch: Math.asin(clamp(y / len, -1, 1)) / RAD,
  };
}

/** yaw/pitch → 이미지 좌표 u, v (0~1) */
export const uvFromYawPitch = (yaw, pitch) => ({ u: 0.5 + wrapYaw(yaw) / 360, v: 0.5 - pitch / 180 });

/** 세로 시야각 + 화면비 → 가로 시야각 (도) */
export const hFovFromV = (vFov, aspect) => (2 * Math.atan(Math.tan((vFov * RAD) / 2) * aspect)) / RAD;
export const vFovFromH = (hFov, aspect) => (2 * Math.atan(Math.tan((hFov * RAD) / 2) / aspect)) / RAD;
