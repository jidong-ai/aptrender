import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layerIdFor, parsePanoFile } from '../src/shared/scene.js';

test('파일 이름 → 장면·레이어 ID', () => {
  assert.deepEqual(parsePanoFile('kitchen_front.jpg'), { id: 'kitchen_front', size: '8k' });
  assert.deepEqual(parsePanoFile('Store_1_4K.JPG'), { id: 'store_1', size: '4k' });
  assert.deepEqual(parsePanoFile('island_b_front_8k.png'), { id: 'island_b_front', size: '8k' });
  assert.equal(parsePanoFile('kitchen_back.jpg'), null); // 정의되지 않은 ID
  assert.equal(parsePanoFile('README.md'), null);
});

test('예전 D5 이름 별칭', () => {
  assert.deepEqual(parsePanoFile('pano_front.png'), { id: 'kitchen_front', size: '8k' });
  assert.deepEqual(parsePanoFile('Pano_Side.JPG'), { id: 'kitchen_side', size: '8k' });
  assert.deepEqual(parsePanoFile('island_a_4k.jpg'), { id: 'island_a_side', size: '4k' });
});

test('누끼 파일(_cut)', () => {
  assert.deepEqual(parsePanoFile('island_a_cut.png'), { id: 'island_a_side', size: '8k', cut: true });
  assert.deepEqual(parsePanoFile('floor_flosso_front_cut.png'), { id: 'floor_flosso_front', size: '8k', cut: true });
});

test('장면에 필요한 레이어 ID', () => {
  assert.equal(layerIdFor('kitchen_front', 'island', 'c'), 'island_c_front');
  assert.equal(layerIdFor('kitchen_side', 'island', 'b'), 'island_b_side');
  assert.equal(layerIdFor('kitchen_side', 'floor', 'portland'), null); // 측면 바닥재는 렌더하지 않음
  assert.equal(layerIdFor('store_1', 'island', 'a'), null);
  assert.equal(layerIdFor('kitchen_front', 'island', null), null);
});
