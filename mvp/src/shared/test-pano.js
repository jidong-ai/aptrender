// 렌더 파노라마가 없을 때 쓰는 테스트 파노라마(방위 눈금 격자)를 캔버스로 만든다.
// 같은 이미지를 두 화면이 보므로, 눈금 숫자로 "서로 어느 방향을 보는지"를 바로 확인할 수 있다.
// transparent: true 이면 배경 없이 격자만 그려서 실제 파노라마 위에 겹쳐 볼 수 있다(방향 검수용).

const NAMES = { 0: '정면', 90: '오른쪽', 180: '뒤', '-90': '왼쪽' };

export function makeTestPano({ width = 4096, tint = '#d8d8d8', label = '', transparent = false } = {}) {
  const height = width / 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  const px = width / 360; // 1도당 픽셀
  const X = (yaw) => (0.5 + yaw / 360) * width;
  const Y = (pitch) => (0.5 - pitch / 180) * height;
  const ink = transparent ? 'rgba(255, 255, 255, ' : 'rgba(30, 30, 30, ';
  const halo = transparent ? 'rgba(0, 0, 0, 0.55)' : 'rgba(255, 255, 255, 0.6)';

  if (!transparent) {
    g.fillStyle = tint;
    g.fillRect(0, 0, width, height);
  }

  const line = (x1, y1, x2, y2, w, alpha, color) => {
    g.strokeStyle = color ?? `${ink}${alpha})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };

  // 세로선(yaw) · 가로선(pitch): 10°마다 얇게, 30°마다 굵게
  for (let yaw = -180; yaw <= 180; yaw += 10) {
    const major = yaw % 30 === 0;
    line(X(yaw), 0, X(yaw), height, major ? px * 0.35 : px * 0.12, major ? 0.55 : 0.25);
  }
  for (let pitch = -80; pitch <= 80; pitch += 10) {
    const major = pitch % 30 === 0;
    line(0, Y(pitch), width, Y(pitch), major ? px * 0.35 : px * 0.12, major ? 0.55 : 0.25);
  }
  line(0, Y(0), width, Y(0), px * 0.6, 0.9); // 수평선
  line(X(0), 0, X(0), height, px * 0.6, 1, '#e5302a'); // 정면(yaw 0)

  const text = (str, x, y, size, color = `${ink}0.9)`, weight = 700) => {
    g.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = size * 0.18;
    g.strokeStyle = halo;
    g.strokeText(str, x, y);
    g.fillStyle = color;
    g.fillText(str, x, y);
  };

  // yaw 눈금: 수평선 바로 위, 30°마다 (±180°는 이음매 양쪽에 반씩 걸리므로 양 끝에 모두 그림)
  for (let yaw = -180; yaw <= 180; yaw += 30) {
    const name = NAMES[yaw === -180 ? 180 : yaw];
    const deg = yaw > 0 ? `+${yaw}°` : `${yaw}°`;
    const x = yaw === -180 ? X(yaw) + px * 4 : yaw === 180 ? X(yaw) - px * 4 : X(yaw);
    text(deg, x, Y(3), px * 2.4, yaw === 0 ? '#e5302a' : undefined);
    if (name) text(name, x, Y(-3.5), px * 2, yaw === 0 ? '#e5302a' : undefined, 600);
  }
  // pitch 눈금: 90°마다 세로 줄을 따라
  for (const yaw of [-90, 0, 90, 180]) {
    for (let pitch = -60; pitch <= 60; pitch += 30) {
      if (pitch === 0) continue;
      const x = (yaw === 180 ? X(yaw) - px * 4 : X(yaw) + px * 4);
      text(pitch > 0 ? `+${pitch}°` : `${pitch}°`, x, Y(pitch) - px * 1.4, px * 1.6, undefined, 600);
    }
  }
  if (label) {
    for (const yaw of [-135, -45, 45, 135]) text(label, X(yaw), Y(15), px * 2.6);
  }
  return canvas;
}

/**
 * 렌더·누끼가 아직 없을 때 쓰는 와이어프레임 레이어(투명 배경 캔버스). rect 크기 비율에 맞춰 그린다.
 *  - island: 이름표가 달린 상자(정면에서 본 아일랜드 자리)
 *  - floor : 반투명 색 + 타일 격자(바닥 전체)
 */
export function makePlaceholderLayer({ kind, rect, label, color = '#8a6a4f', width = 1024 }) {
  const aspect = ((rect[2] - rect[0]) * 2) / (rect[3] - rect[1]); // 파노라마는 가로:세로 2:1
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.max(8, Math.round(width / aspect));
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  if (kind === 'floor') {
    g.fillStyle = color;
    g.globalAlpha = 0.55;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.35;
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    const step = W / 72;
    for (let x = 0; x <= W; x += step) g.strokeRect(x, 0, step, H);
    for (let y = 0; y <= H; y += step) g.strokeRect(0, y, W, step);
  } else {
    const pad = W * 0.06;
    g.fillStyle = color;
    g.globalAlpha = 0.82;
    g.fillRect(pad, H * 0.3, W - pad * 2, H * 0.62);
    g.globalAlpha = 1;
    g.strokeStyle = '#fff';
    g.lineWidth = W * 0.008;
    g.setLineDash([W * 0.03, W * 0.02]);
    g.strokeRect(pad, H * 0.3, W - pad * 2, H * 0.62);
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(pad, H * 0.22, W - pad * 2, H * 0.1); // 상판
  }
  if (label) {
    const size = Math.round((kind === 'floor' ? H * 0.06 : H * 0.12) * 1);
    g.font = `700 ${size}px Pretendard, -apple-system, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = size * 0.2;
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    const y = kind === 'floor' ? H * 0.5 : H * 0.6;
    g.strokeText(label, W / 2, y);
    g.fillStyle = '#fff';
    g.fillText(label, W / 2, y);
  }
  return canvas;
}
