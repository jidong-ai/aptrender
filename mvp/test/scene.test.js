import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeScene, parsePanoFile } from '../src/shared/scene.js';

test('파노라마 파일 이름 → 장면 키', () => {
  assert.deepEqual(parsePanoFile('v1_island0_floor0_8k.jpg'), { key: 'v1_none_base', size: '8k' });
  assert.deepEqual(parsePanoFile('V2_Island2_FloorB_4K.PNG'), { key: 'v2_2_b', size: '4k' });
  assert.deepEqual(parsePanoFile('v1_island1_floora.jpg'), { key: 'v1_1_a', size: '8k' }); // 크기 생략 = 8K
  assert.equal(parsePanoFile('v3_island1_floora_4k.jpg'), null); // 정의되지 않은 시점
  assert.equal(parsePanoFile('v1_island1_floord_4k.jpg'), null);
  assert.equal(parsePanoFile('README.md'), null);
});

test('D5 이름 그대로 쓰는 별칭', () => {
  assert.deepEqual(parsePanoFile('pano_front.png'), { key: 'v1_none_base', size: '8k' });
  assert.deepEqual(parsePanoFile('Pano_Side.JPG'), { key: 'v2_none_base', size: '8k' });
  assert.deepEqual(parsePanoFile('island_a_4k.jpg'), { key: 'v2_2_base', size: '4k' });
});

test('누끼 파일(_cut)', () => {
  assert.deepEqual(parsePanoFile('island_a_cut.png'), { key: 'v2_2_base', size: '8k', cut: true });
  assert.deepEqual(parsePanoFile('v2_island2_floorb_cut.png'), { key: 'v2_2_b', size: '8k', cut: true });
});

test('장면 설명 문구', () => {
  assert.equal(describeScene('v2', '2', 'b'), 'V2 측면 · 아일랜드 2 · 바닥재 B');
  assert.equal(describeScene('v1', 'none', 'base'), 'V1 정면 · 아일랜드 없음 · 기존 바닥');
});
