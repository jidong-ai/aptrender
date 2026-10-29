// 아이맥(XR) 화면의 소리: 단계마다 음성 가이드, 뒤에 깔리는 BGM.
// 진행은 서버가 쥐고, 여기서는 단계가 바뀌는 순간 그 단계의 음성을 튼다(미리 디코딩해 지연 없음).
// 재생 위치 = 서버 시각 - 단계에 들어간 시각 → 새로고침·재접속해도 같은 지점부터 이어진다
import { STEP } from '../shared/scenario.js';
import { bgmFor, voiceTimeline } from '../shared/voice.js';

const BGM_LEVEL = 0.35; // 음성이 없을 때
const BGM_DUCK = 0.12; // 음성이 나오는 동안
const BGM_IDLE = 0.2; // 시작화면에서 기다리는 동안
const VOICE_FADE = 0.12; // 넘겨서 끊을 때(초)
const BGM_XFADE = 2; // 곡이 바뀔 때(초)
const VOL_KEY = 'weave.audio.volume';

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

export function createAudio({ serverNow, log = () => {} }) {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  const voiceBus = ctx.createGain();
  const bgmBus = ctx.createGain();
  voiceBus.connect(master);
  bgmBus.connect(master);
  master.connect(ctx.destination);

  let manifest = { voice: {}, bgm: {} };
  const buffers = new Map(); // url → AudioBuffer
  let volume = Math.min(1, Math.max(0, Number(store.get(VOL_KEY) ?? 1)));
  let muted = false;
  let voices = []; // 지금 단계의 음성 { src, gain }
  let bgm = null; // { name, src, gain }
  let duckUntil = 0;
  const history = []; // 테스트·디버그: { key, offsetMs, silent }
  const applyVolume = () => master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05);
  applyVolume();

  async function load(url) {
    if (!url || buffers.has(url)) return;
    try {
      const data = await (await fetch(url)).arrayBuffer();
      buffers.set(url, await ctx.decodeAudioData(data));
    } catch (err) {
      log(`소리 불러오기 실패: ${url} (${err.message})`);
    }
  }

  /** manifest를 받아 BGM·음성을 모두 미리 디코딩한다(BGM 먼저) */
  async function preload() {
    try {
      manifest = await (await fetch('/api/audio')).json();
    } catch {
      return manifest;
    }
    await Promise.all(Object.values(manifest.bgm).map((b) => load(b.url)));
    await Promise.all(Object.values(manifest.voice).map((v) => load(v.url)));
    const n = Object.values(manifest.voice).filter((v) => buffers.has(v.url)).length;
    log(`소리 준비: 음성 ${n}/${Object.keys(manifest.voice).length} · BGM ${Object.values(manifest.bgm).filter((b) => buffers.has(b.url)).length}`);
    return manifest;
  }

  function stopVoices() {
    const t = ctx.currentTime;
    for (const v of voices) {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setTargetAtTime(0, t, VOICE_FADE / 3);
      try {
        v.src.stop(t + VOICE_FADE);
      } catch {}
    }
    voices = [];
    duckUntil = 0;
    duck();
  }

  // BGM 볼륨: 음성이 나오는 동안 낮추고, 끝나면 되돌린다
  function duck() {
    if (!bgm) return;
    const t = ctx.currentTime;
    const base = bgm.idle ? BGM_IDLE : BGM_LEVEL;
    const g = bgm.gain.gain;
    g.cancelScheduledValues(t);
    if (duckUntil > t) {
      g.setTargetAtTime(BGM_DUCK, t, 0.08);
      g.setTargetAtTime(base, duckUntil, 0.4);
    } else g.setTargetAtTime(base, t, 0.4);
  }

  function setBgm(name, idle) {
    if (bgm?.name === name) {
      if (bgm.idle !== idle) {
        bgm.idle = idle;
        duck();
      }
      return;
    }
    const t = ctx.currentTime;
    if (bgm) {
      bgm.gain.gain.cancelScheduledValues(t);
      bgm.gain.gain.setTargetAtTime(0, t, BGM_XFADE / 3);
      bgm.src.stop(t + BGM_XFADE);
      bgm = null;
    }
    const buf = buffers.get(manifest.bgm[name]?.url);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(bgmBus);
    src.start(t);
    bgm = { name, src, gain, idle };
    gain.gain.setTargetAtTime(idle ? BGM_IDLE : BGM_LEVEL, t, BGM_XFADE / 3);
  }

  /** 단계에 들어갈 때(또는 처음 접속했을 때) 호출. 이전 음성은 짧게 끊고 이 단계 음성을 이어서 튼다 */
  function enterStep(stepId, enteredAt) {
    const step = STEP[stepId];
    stopVoices();
    setBgm(bgmFor(step), stepId === 'S0-0');
    const offset = Math.max(0, serverNow() - enteredAt); // 이미 지난 시간(ms)
    const now = ctx.currentTime;
    for (const { key, at, ms } of voiceTimeline(step, manifest)) {
      if (offset >= at + ms) continue; // 이미 끝난 줄
      const buf = buffers.get(manifest.voice[key]?.url);
      history.push({ key, offsetMs: Math.round(Math.max(0, offset - at)), silent: !buf, at: Date.now() });
      if (history.length > 100) history.shift();
      const startIn = Math.max(0, at - offset) / 1000;
      duckUntil = Math.max(duckUntil, now + startIn + (ms - Math.max(0, offset - at)) / 1000);
      if (!buf) continue; // --dry 추정치: 길이만 있고 소리 없음
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      src.connect(gain).connect(voiceBus);
      src.start(now + startIn, Math.max(0, offset - at) / 1000);
      voices.push({ src, gain });
    }
    duck();
  }

  return {
    ctx,
    preload,
    enterStep,
    get manifest() {
      return manifest;
    },
    get history() {
      return history;
    },
    /** 테스트·디버그: 지금 걸려 있는 음성 수, BGM 곡 */
    get playing() {
      return { voices: voices.length, bgm: bgm?.name ?? null, state: ctx.state };
    },
    get unlocked() {
      return ctx.state === 'running';
    },
    /** 브라우저는 사용자 조작 전에는 소리를 막는다. 첫 키·클릭에서 호출 */
    unlock: () => ctx.resume(),
    toggleMute() {
      muted = !muted;
      applyVolume();
      return muted;
    },
    nudgeVolume(d) {
      volume = Math.round(Math.min(1, Math.max(0, volume + d)) * 10) / 10;
      muted = false;
      store.set(VOL_KEY, String(volume));
      applyVolume();
      return volume;
    },
    get status() {
      if (ctx.state !== 'running') return '소리 꺼짐 · 아무 키나 누르기';
      return muted ? '음소거(M)' : `소리 ${Math.round(volume * 100)}%`;
    },
  };
}
