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
