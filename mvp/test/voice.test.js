import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEP } from '../src/shared/scenario.js';
import { allVoiceLines, bgmFor, effectiveAuto, speakText, voiceLines, voiceMs, voiceTimeline, VOICE_GAP_MS, VOICE_PAD_MS } from '../src/shared/voice.js';

test('음성 대사: 말풍선 → 본문 → 가이드 순으로 하나, 그다음 say', () => {
  assert.deepEqual(voiceLines('S0-1').map((l) => l.role), ['manager']); // 프롤로그 본문
  assert.deepEqual(voiceLines('S2-1').map((l) => [l.key, l.role]), [['S2-1-1', 'customer']]); // 가이드보다 김민선 말풍선
  assert.deepEqual(voiceLines('S4-2a').map((l) => l.key), ['S4-2a-1', 'S4-2a-2']); // 가이드 + 매니저 대사
  assert.deepEqual(voiceLines('S0-0'), []); // 시작화면
  assert.deepEqual(voiceLines('S5-3'), []); // 마무리
});

test('음성 대사: 바로 앞과 같은 가이드는 다시 읽지 않고, voice 필드로 덮어쓴다', () => {
  assert.equal(STEP['S3-1c'].guide, STEP['S3-1b'].guide);
  assert.deepEqual(voiceLines('S3-1c').map((l) => l.text), [speakText(STEP['S3-1c'].say)]); // 가이드는 S3-1b에서 읽음
  assert.deepEqual(voiceLines('S4-2b'), []);
  assert.deepEqual(voiceLines('S2-2a').map((l) => l.key), ['S2-2a-1']); // say는 가이드와 겹쳐 안 읽음
  assert.deepEqual(voiceLines('S3-2a'), []); // 고르는 장면
  const keys = allVoiceLines().map((l) => l.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('읽는 소리만 바꾸기: Weave·XR·mm·개수', () => {
  assert.equal(speakText('Weave 매장'), '위브 매장');
  assert.equal(speakText('XR상담을 요청'), '엑스알 상담을 요청');
  assert.equal(speakText('최소 900mm는'), '최소 구백 밀리미터는');
  assert.equal(speakText('아일랜드 3개를, 바닥재 2개를'), '아일랜드 세 개를, 바닥재 두 개를');
  assert.equal(speakText('첫 줄,\n둘째 줄'), '첫 줄, 둘째 줄');
});

test('자동 진행 시간: 러닝타임과 음성 + 여유 중 긴 쪽, 음성이 없으면 그대로', () => {
  const manifest = { voice: { 'S0-1-1': { ms: 4000 }, 'S4-2a-1': { ms: 3000 }, 'S4-2a-2': { ms: 6000 } } };
  assert.equal(effectiveAuto('S0-1', manifest), 4000 + VOICE_PAD_MS); // 3초짜리 장이 음성만큼 늘어남
  assert.equal(effectiveAuto('S0-1', null), STEP['S0-1'].auto);
  assert.equal(effectiveAuto('S0-1', { voice: { 'S0-1-1': { ms: 1000 } } }), STEP['S0-1'].auto); // 짧으면 러닝타임
  assert.equal(effectiveAuto('S2-1', manifest), 0); // 자동 단계가 아님
  assert.deepEqual(voiceTimeline('S4-2a', manifest), [
    { key: 'S4-2a-1', at: 0, ms: 3000 },
    { key: 'S4-2a-2', at: 3000 + VOICE_GAP_MS, ms: 6000 },
  ]);
  assert.equal(voiceMs('S4-2a', manifest), 9000 + VOICE_GAP_MS);
});

test('BGM: 매장까지는 intro, 상담실부터 consult', () => {
  assert.equal(bgmFor(STEP['S0-0']), 'intro');
  assert.equal(bgmFor(STEP['S0-6e']), 'intro');
  assert.equal(bgmFor(STEP['S1']), 'consult');
  assert.equal(bgmFor(STEP['S5-3']), 'consult');
});
