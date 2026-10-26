// 바닥재 적용 영역(선택 영역) 마스크: 파노라마(2:1) 위의 다각형. 마스크 편집기(/mask)·pano:prep·화면이 같이 쓴다.
// 파일: assets/pano/masks/{장면}_floor.svg. 편집기로 그린 SVG는 data-weave-points에 점(0~1 좌표)을 담아 다시 열 수 있다.
// Figma 펜툴로 그린 SVG·PNG도 그대로 쓸 수 있다(편집기에서는 그림으로만 보임)

export const MASK_W = 2048;
export const MASK_H = 1024;

/** 점 [[u, v], ...](0~1) → SVG 문자열 */
export function maskSvg(points) {
  const pts = points.map(([u, v]) => `${(u * MASK_W).toFixed(1)},${(v * MASK_H).toFixed(1)}`).join(' ');
  const data = JSON.stringify(points.map(([u, v]) => [+u.toFixed(5), +v.toFixed(5)]));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MASK_W}" height="${MASK_H}" viewBox="0 0 ${MASK_W} ${MASK_H}" data-weave-points='${data}'><polygon points="${pts}" fill="#1AA0FF"/></svg>\n`;
}

/** 편집기로 만든 SVG면 점 목록, 아니면 null(Figma 등에서 그린 마스크) */
export function maskPoints(svgText) {
  const m = /data-weave-points='([^']*)'/.exec(svgText ?? '');
  if (!m) return null;
  try {
    const pts = JSON.parse(m[1]);
    return Array.isArray(pts) && pts.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && n >= 0 && n <= 1)) ? pts : null;
  } catch {
    return null;
  }
}

/** 저장해도 되는 마스크 SVG인가(서버에서 검사): 크기 제한, 스크립트·외부 참조 없음 */
export function isSafeMaskSvg(text) {
  return typeof text === 'string' && text.length < 500_000 && /^\s*<svg[\s>]/i.test(text) && !/<script|on\w+\s*=|href\s*=|<foreignObject/i.test(text);
}
