import { compassAngle, pickSlide, slideItems } from '../js/carousel.js';
import { assert, test } from './runner.js';

const JSON_DATA = {
  media: 'https://cdn.example/media/',
  window_views: { 7: { img: 'genplan.png', w: 100, h: 50, a: [[90, 10, 20]] } },
};

test('слайды квартиры: планировка, план с размерами, план этажа, вид из окон — только то, что есть', () => {
  const full = slideItems({ plan: 'p.svg', dims: 'd.png', floor: 'f.svg', pos: 3, wvp: 7 }, JSON_DATA);
  assert.deepEqual(full.map(s => s.kind), ['plan', 'dims', 'floor', 'wv']);
  assert.equal(full[0].url, 'https://cdn.example/media/p.svg');
  assert.equal(full[2].pos, 3);
  assert.equal(full[3].url, 'https://cdn.example/media/genplan.png');
  assert.deepEqual(slideItems({ plan: 'p.svg', dims: null, floor: 'f.svg', wvp: 99 }, JSON_DATA).map(s => s.kind), ['plan', 'floor']);
  assert.deepEqual(slideItems(null, JSON_DATA), []);
  assert.deepEqual(slideItems({ plan: 'p.svg' }, null), []);
});

test('выбор слайда по запомненному типу; если такого нет — первый', () => {
  const items = [{ kind: 'plan' }, { kind: 'dims' }, { kind: 'floor' }, { kind: 'wv' }];
  assert.equal(pickSlide(items, 'wv'), 3);
  assert.equal(pickSlide(items, null), 0);
  assert.equal(pickSlide([{ kind: 'plan' }, { kind: 'floor' }], 'wv'), 0);
  assert.equal(pickSlide([{ kind: 'plan' }, { kind: 'floor' }], 'floor'), 1);
  assert.equal(pickSlide([], 'wv'), 0);
});

test('компас: wr для планировок и плана этажа, wrv для вида из окон, без угла — без компаса', () => {
  const section = { wr: 337, wrv: 0 };
  assert.equal(compassAngle('plan', section), 337);
  assert.equal(compassAngle('dims', section), 337);
  assert.equal(compassAngle('floor', section), 337);
  assert.equal(compassAngle('wv', section), 0, 'ноль — тоже угол: север вверху');
  assert.equal(compassAngle('wv', { wr: 45, wrv: null }), null);
  assert.equal(compassAngle('plan', undefined), null);
  const items = slideItems({ plan: 'p.svg', floor: 'f.svg', wvp: 7, sec: '5' }, { ...JSON_DATA, sections: { 5: { wr: 45, wrv: 90 } } });
  assert.deepEqual(items.map(s => [s.kind, s.angle]), [['plan', 45], ['floor', 45], ['wv', 90]]);
  assert.deepEqual(slideItems({ plan: 'p.svg', sec: '9' }, JSON_DATA).map(s => s.angle), [null]);
});
