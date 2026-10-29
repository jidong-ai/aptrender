// 음성 가이드·BGM 만들기(ElevenLabs). 맥북에서 mvp/.env에 키를 넣고 실행한다.
//
//   npm run audio:gen              바뀐 대사만 새로 만든다(문구를 고친 뒤)
//   npm run audio:gen -- --bgm     BGM 2곡도 만든다(처음 한 번, 또는 BGM 프롬프트를 바꿨을 때)
//   npm run audio:gen -- --force   모든 대사를 다시 만든다(목소리를 바꿨을 때)
//   npm run audio:gen -- --only=S0-1,S2-1   해당 단계만 다시 만든다
//   npm run audio:gen -- --dry     키 없이 글자 수로 길이만 추정해 manifest를 쓴다(싱크 테스트용, 소리 없음)
//
// 결과: assets/audio/voice/{단계}-{n}.mp3, assets/audio/bgm/{intro|consult}.mp3, assets/audio/manifest.json
// 대사 목록과 발음 바꾸기는 src/shared/voice.js
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { allVoiceLines } from '../src/shared/voice.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'assets', 'audio');
const MANIFEST = path.join(OUT, 'manifest.json');
const API = 'https://api.elevenlabs.io';

// ---------- 설정: 목소리 톤·BGM 프롬프트는 여기서 고친다 ----------
const TTS_MODEL = 'eleven_multilingual_v2';
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true };
const BGM = {
  intro: {
    ms: 90_000,
    prompt:
      'Calm, bright lo-fi piano with soft electric piano chords and light brushed drums, 85 BPM. Feels like walking into a clean, sunlit interior design showroom in the morning. Warm and welcoming, minimal, seamless loop. Instrumental only, no vocals.',
  },
  consult: {
    ms: 90_000,
    prompt:
      'Gentle ambient background for a quiet consultation: soft pads, sparse warm piano notes, very subtle pulse, 70 BPM. Stays in the background under conversation, no sudden changes, seamless loop. Instrumental only, no vocals.',
  },
};

// ---------- 인자·.env ----------
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
const DRY = flag('dry');

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
loadEnv();
const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = { manager: process.env.VOICE_MANAGER, customer: process.env.VOICE_CUSTOMER };

if (!DRY) {
  const missing = [!KEY && 'ELEVENLABS_API_KEY', !VOICE_ID.manager && 'VOICE_MANAGER', !VOICE_ID.customer && 'VOICE_CUSTOMER'].filter(Boolean);
  if (missing.length) {
    console.error(`mvp/.env에 ${missing.join(', ')}가 없습니다. .env.example을 복사해 .env를 만들고 값을 넣어 주세요.`);
    console.error('키 없이 싱크만 시험하려면: npm run audio:gen -- --dry');
    process.exit(1);
  }
}

// ---------- 유틸 ----------
const sha1 = (v) => crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex');
const readManifest = () => {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch {
    return {};
  }
};
// 글자 수로 읽는 시간 추정(한국어 약 6.5자/초, 공백 제외)
const estimateMs = (text) => Math.round((text.replace(/\s/g, '').length / 6.5) * 1000 + 300);

async function call(pathname, body, accept) {
  const res = await fetch(`${API}${pathname}`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: accept },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} — ${text.slice(0, 400)}`);
  }
  return res;
}

/** 대사 한 줄 → mp3 + 실제로 말이 끝나는 시각(ms). 같은 목소리의 앞뒤 문장을 넘겨 톤을 잇는다 */
async function tts(line, prevText, nextText) {
  const res = await call(
    `/v1/text-to-speech/${encodeURIComponent(VOICE_ID[line.role])}/with-timestamps?output_format=mp3_44100_128`,
    { text: line.text, model_id: TTS_MODEL, voice_settings: VOICE_SETTINGS, previous_text: prevText, next_text: nextText },
    'application/json',
  );
  const json = await res.json();
  const audio = Buffer.from(json.audio_base64, 'base64');
  const ends = json.alignment?.character_end_times_seconds ?? [];
  // 말이 끝나는 시각. 정렬 정보가 없으면 파일 길이(128kbps 고정)로 계산
  const ms = ends.length ? Math.round(ends.at(-1) * 1000) : Math.round((audio.length * 8) / 128);
  return { audio, ms };
}

// ---------- 대사 ----------
const manifest = readManifest();
const prev = manifest.voice ?? {};
const next = {};
const lines = allVoiceLines();
let made = 0;
let kept = 0;
let failed = 0;
fs.mkdirSync(path.join(OUT, 'voice'), { recursive: true });

for (const [i, line] of lines.entries()) {
  const stepId = line.key.replace(/-\d+$/, '');
  const hash = sha1([line.text, line.role, DRY ? 'dry' : VOICE_ID[line.role], TTS_MODEL, VOICE_SETTINGS]);
  const file = `voice/${line.key}.mp3`;
  const old = prev[line.key];
  const wanted = !only || only.includes(stepId);
  const fresh = old?.hash === hash && (DRY || fs.existsSync(path.join(OUT, file)));
  // --only로 고른 단계는 문구가 같아도 다시 만든다. --dry는 실제로 만든 음성을 건드리지 않는다
  const redo = wanted && (!fresh || flag('force') || Boolean(only)) && !(DRY && old && !old.dry);
  if (!redo) {
    if (old) next[line.key] = old;
    if (old) kept += 1;
    continue;
  }
  if (DRY) {
    next[line.key] = { role: line.role, text: line.text, ms: estimateMs(line.text), hash, dry: true };
    made += 1;
    continue;
  }
  const sameRole = (j) => (lines[j]?.role === line.role ? lines[j].text : undefined);
  try {
    process.stdout.write(`${line.key} (${line.role}) ${line.text.slice(0, 28)}… `);
    const { audio, ms } = await tts(line, sameRole(i - 1), sameRole(i + 1));
    fs.writeFileSync(path.join(OUT, file), audio);
    next[line.key] = { role: line.role, text: line.text, file, ms, hash };
    made += 1;
    console.log(`${(ms / 1000).toFixed(1)}초`);
  } catch (err) {
    failed += 1;
    console.log('실패');
    console.error(`  ${err.message}`);
    if (old) next[line.key] = old; // 예전 파일이 있으면 그대로 쓴다
  }
}

// 대사가 없어진 단계의 파일 정리
for (const f of fs.readdirSync(path.join(OUT, 'voice'))) {
  const key = f.replace(/\.mp3$/, '');
  if (!next[key] || next[key].dry) fs.rmSync(path.join(OUT, 'voice', f));
}

// ---------- BGM ----------
const bgm = { ...(manifest.bgm ?? {}) };
if (flag('bgm')) {
  fs.mkdirSync(path.join(OUT, 'bgm'), { recursive: true });
  for (const [name, spec] of Object.entries(BGM)) {
    const hash = sha1([spec.prompt, spec.ms]);
    const file = `bgm/${name}.mp3`;
    if (bgm[name]?.hash === hash && fs.existsSync(path.join(OUT, file)) && !flag('force')) {
      console.log(`BGM ${name}: 그대로(프롬프트 변경 없음)`);
      continue;
    }
    if (DRY) {
      if (!bgm[name] || bgm[name].dry) bgm[name] = { ms: spec.ms, hash, dry: true };
      continue;
    }
    try {
      process.stdout.write(`BGM ${name} ${spec.ms / 1000}초 만드는 중(1~2분)… `);
      const res = await call('/v1/music', { prompt: spec.prompt, music_length_ms: spec.ms }, 'audio/mpeg');
      const audio = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(path.join(OUT, file), audio);
      bgm[name] = { file, ms: spec.ms, hash };
      console.log('완료');
    } catch (err) {
      failed += 1;
      console.log('실패');
      console.error(`  ${err.message}`);
    }
  }
}

fs.writeFileSync(MANIFEST, `${JSON.stringify({ model: TTS_MODEL, voice: next, bgm }, null, 2)}\n`);
console.log(`\n대사 ${lines.length}줄: 새로 ${made} · 그대로 ${kept}${failed ? ` · 실패 ${failed}` : ''}${DRY ? ' (--dry: 길이 추정치만, 소리 없음)' : ''}`);
console.log(`→ ${path.relative(ROOT, MANIFEST)}. 서버를 켜 둔 채로 아이맥 화면을 새로고침하면 반영됩니다.`);
if (failed) process.exitCode = 1;
