import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeScene, parsePanoFile } from '../src/shared/scene.js';

test('파노라마 파일 이름 → 장면 키', () => {
  assert.deepEqual(parsePanoFile('v1_island0_floor0_8k.jpg'), { key: 'v1_none_base', size: '8k' });
  assert.deepEqual(parsePanoFile('V2_Island2_FloorB_4K.PNG'), { key: 'v2_2_b', size: '4k' });
  assert.equal(parsePanoFile('v4_island1_floora_4k.jpg'), null);
  assert.equal(parsePanoFile('v1_island1_floord_4k.jpg'), null);
  assert.equal(parsePanoFile('README.md'), null);
  assert.equal(parsePanoFile('white_day_4K.png').key, 'v1_none_base');
});

test('장면 설명 문구', () => {
  assert.equal(describeScene('v2', '2', 'b'), 'V2 아일랜드 앞 · 아일랜드 2 · 바닥재 B');
  assert.equal(describeScene('v1', 'none', 'base'), 'V1 전체 · 아일랜드 없음 · 기존 바닥');
});
