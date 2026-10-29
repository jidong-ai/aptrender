// 음성 가이드: 단계마다 읽을 대사와, 음성 길이에 맞춘 자동 진행 시간. 서버·생성 스크립트·태블릿·XR이 함께 쓴다.
// 대사는 scenario.js의 화면 문구에서 뽑는다. 문구를 고친 뒤 npm run audio:gen을 다시 돌리면 바뀐 줄만 새로 만든다.
//
// 단계에서 읽는 순서
//  1. caption(말풍선) — customer면 김민선, manager면 선배 매니저 목소리
//  2. 없으면 copy(프롤로그 본문), 없으면 guide(가이드 UI). 바로 앞 단계와 같은 guide는 다시 읽지 않는다
//  3. 그다음 say(관람객이 맡은 매니저가 고객에게 하는 말)
// 단계 필드 voice로 덮어쓴다: false = 읽지 않음, '문장' = 1번 줄을 다르게 읽음, { main, say } = 줄별로(false 또는 '문장')
import { STEP, STEPS } from './scenario.js';

export const VOICE_ROLES = ['manager', 'customer'];
export const VOICE_PAD_MS = 700; // 음성이 끝나고 자동으로 넘어가기 전 여유
export const VOICE_GAP_MS = 250; // 한 단계 안에서 줄과 줄 사이

// 화면 글자는 그대로 두고 읽는 소리만 바꾼다
export const PRONOUNCE = [
  [/Weave/gi, '위브'],
  [/XR(?=[가-힣])/g, '엑스알 '],
  [/XR/g, '엑스알'],
  [/(^|[^\d])([1-4])개/g, (_, pre, n) => `${pre}${['', '한', '두', '세', '네'][n]} 개`],
  [/(\d+)mm/g, (_, n) => `${Number(n) === 900 ? '구백' : n} 밀리미터`],
  [/3D/g, '쓰리디'],
  [/[‘’'"“”]/g, ''],
  [/\s*\n\s*/g, ' '],
];

export function speakText(text) {
  let s = text;
  for (const [re, to] of PRONOUNCE) s = s.replace(re, to);
  return s.trim();
}

/** 단계에서 읽을 줄 [{ key, role, text }] (text = 실제로 읽는 문장) */
export function voiceLines(stepOrId) {
  const step = typeof stepOrId === 'string' ? STEP[stepOrId] : STEP[stepOrId?.id];
  if (!step || step.voice === false) return [];
  const over = typeof step.voice === 'object' && step.voice ? step.voice : { main: typeof step.voice === 'string' ? step.voice : undefined };
  const prev = STEPS[step.index - 1];
  const lines = [];

  let main = null;
  if (step.caption) main = { role: step.caption.speaker === 'customer' ? 'customer' : 'manager', text: step.caption.text };
  else if (step.copy) main = { role: 'manager', text: step.copy };
  else if (step.guide && !(prev?.guide === step.guide && !prev.caption)) main = { role: 'manager', text: step.guide };
  if (over.main === false) main = null;
  else if (typeof over.main === 'string') main = { role: main?.role ?? 'manager', text: over.main };
  if (main) lines.push(main);

  if (step.say && over.say !== false) lines.push({ role: 'manager', text: typeof over.say === 'string' ? over.say : step.say });

  return lines.map((l, i) => ({ key: `${step.id}-${i + 1}`, role: l.role, text: speakText(l.text) }));
}

/** 모든 단계의 대사(생성 스크립트·문서용) */
export const allVoiceLines = () => STEPS.flatMap((s) => voiceLines(s));

/** 단계의 줄별 시작 시각과 길이 [{ key, at, ms }]. manifest에 없는 줄은 빠진다 */
export function voiceTimeline(stepOrId, manifest) {
  const out = [];
  let at = 0;
  for (const line of voiceLines(stepOrId)) {
    const ms = manifest?.voice?.[line.key]?.ms;
    if (!ms) continue;
    out.push({ key: line.key, at, ms });
    at += ms + VOICE_GAP_MS;
  }
  return out;
}

/** 단계 음성 전체 길이(ms). 음성이 없으면 0 */
export function voiceMs(stepOrId, manifest) {
  const t = voiceTimeline(stepOrId, manifest).at(-1);
  return t ? t.at + t.ms : 0;
}

/** 자동으로 넘어가는 단계의 실제 대기 시간: 정해 둔 러닝타임과 '음성 + 여유' 중 긴 쪽 */
export function effectiveAuto(stepOrId, manifest) {
  const step = typeof stepOrId === 'string' ? STEP[stepOrId] : stepOrId;
  if (!step?.auto) return 0;
  const ms = voiceMs(step, manifest);
  return Math.max(step.auto, ms ? ms + VOICE_PAD_MS : 0);
}

// BGM: 매장까지(시작화면·프롤로그·매장)는 intro, 상담실 이후는 consult
export const bgmFor = (step) => (['opening', 'prologue'].includes(step?.chapter) ? 'intro' : 'consult');
